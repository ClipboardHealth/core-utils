# Verification Tooling Notes

Use this reference when the task depends on external design/project sources or shared agent workflows.

## Source References

- **Figma**: Use the Figma MCP/plugin when available. For Figma URLs, explicitly fetch screenshot plus structured design context before implementation. Prefer `get_design_context`, `get_screenshot`, `get_metadata`, `get_variable_defs`, `search_design_system`, and Code Connect results over visual guessing. If the MCP is unavailable or the link is blocked by login/permissions, ask for a Figma screenshot/export or link-specific notes before claiming exact fidelity.
- **Notion**: Use Notion MCP for project docs, design process notes, and rollout context. Summarize only the UI requirements that affect the implementation or verification plan.
- **Linear**: Use Linear MCP for project and ticket traceability. Keep tracking minimal: one project and only the few tickets needed to map back to source work.
- **Screenshots**: Treat screenshots as design evidence, but call out missing dimensions, states, or interaction details when they are not visible.
- **Written ideas**: Treat the user's text as product intent, not a complete visual spec. Search existing Clipboard components and stories first, compose the closest pattern, and create a Storybook checkpoint for human confirmation when the idea leaves room for visual interpretation.
- **No reference**: Do not invent a new visual language. Derive from nearby feature patterns, shared design-system components, and existing Storybook stories, then verify the proposed UI in Storybook before product integration.

## Figma Workflow

When a Figma URL is present:

1. Use the installed Figma skill/plugin or MCP first. If the environment exposes a named Figma or design tool, use that before coding from memory.
2. Parse the URL before calling tools:
   - For `figma.com/design/:fileKey/...?...node-id=1-2`, use the `/design/` segment as `fileKey` and convert `node-id` hyphens to colons, such as `1-2` to `1:2`, when the tool schema expects a node ID.
   - For branch links, use the branch file key when the Figma server requires it.
   - For desktop selection-based flows, follow the local Figma server's parameter requirements; the file key may be implicit.
3. If the agent does not automatically choose the right Figma tool, request it by name:
   - `get_design_context` for structured design context.
   - `get_screenshot` for visual fidelity.
   - `get_variable_defs` for variables, styles, colors, spacing, and typography.
   - `get_metadata` to map pages/layers or recover from large-context designs.
   - `search_design_system` when looking for reusable components, variables, or styles.
   - `get_code_connect_map` or Code Connect mappings when the design system has mappings to repo components.
   - `get_libraries` when the remote Figma MCP exposes library metadata and the task needs design-system source discovery.
4. Treat Figma MCP output as design context, not production-ready code. Translate it into the repo's components, theme tokens, Storybook patterns, and TypeScript rules.
5. Fetch screenshot, metadata, design context, variables/tokens, and design-system matches for the target node. If `get_design_context` is too large or truncated, call `get_metadata`, select smaller child nodes, and re-run `get_design_context` on the relevant subtree.
6. Map Figma components to repo components before coding. If Code Connect mappings exist, use them; otherwise search the repo and Storybook for closest components.
7. Implement the smallest isolated Storybook surface that can be compared to the Figma screenshot.
8. If the repo supports `@storybook/addon-designs`, attach the Figma URL with `parameters.design` in the story when the story is expected to remain useful.
9. Capture a Storybook screenshot at the matching viewport and compare layout, spacing, typography, color, border radius, iconography, density, and state text.
10. If the Figma URL returns a login screen, permission error, network error, or non-design page, fall back to a provided screenshot/export. If no visual export is available, proceed as a written idea/no-reference task and label exact Figma fidelity as unverified.
11. Ask the human to confirm when the match depends on taste, when a design token is missing, or when the Figma node appears stale compared with current code.

## Browser Verification

Use the repo's native Storybook server first. Then use whichever browser-controlled surface is available in the current agent: Browser plugin, Chrome, Playwright CLI/script, Playwright MCP, or the agent's built-in browser automation.

For CLI agents, manage Storybook as a background process with explicit cleanup. A foreground dev server can block the agent before it captures screenshots, deletes temporary stories, or reports results.

```bash
storybook_command="$(bash scripts/inspect-ui-verification-surface.sh storybook-command)"
storybook_log="${TMPDIR:-/tmp}/frontend-ui-verification-storybook.log"

bash -lc "$storybook_command" >"$storybook_log" 2>&1 &
storybook_pid="$!"

# Run browser verification here, then always stop the server.
kill "$storybook_pid" 2>/dev/null || true
wait "$storybook_pid" 2>/dev/null || true
```

Prefer the helper for deterministic commands and URLs:

```bash
bash scripts/inspect-ui-verification-surface.sh storybook-command
bash scripts/inspect-ui-verification-surface.sh storybook-build-command
bash scripts/inspect-ui-verification-surface.sh storybook-test-command
bash scripts/inspect-ui-verification-surface.sh component-test-command
bash scripts/inspect-ui-verification-surface.sh storybook-url <story-id>
bash scripts/inspect-ui-verification-surface.sh storybook-iframe-url <story-id>
```

Access ladder:

1. Start Storybook with the exact command returned by `storybook-command`, then open the story URL returned by `storybook-url <story-id>`.
2. If the Storybook shell interferes with inspection, open the canvas URL returned by `storybook-iframe-url <story-id>`.
3. If no browser plugin is available, use Playwright to navigate to the Storybook URL, set the viewport, wait for the story root, collect console errors, and capture a screenshot.
4. Classify console output as story-introduced, provider/decorator gaps, or pre-existing/global Storybook warnings. Fix story-introduced rendering errors before claiming the story is verified.
5. If the helper returns a native Storybook test/a11y command, use it for isolated accessibility or interaction checks after the story renders.
6. If the helper returns a native component browser-test command, use it only for focused component-level checks that can mount with stable providers and mocks.
7. If the dev server fails, run the exact command returned by `storybook-build-command` and inspect the built Storybook when practical.
8. If provider/context errors block rendering, add story decorators, fixture props, or local mocks. Do not switch to full product integration just to see the UI.
9. Stop only with a concrete blocker: command run, URL attempted, error observed, and why no screenshot could be captured.

## Component-Level Browser Checks

Only use component-level Playwright or Storybook test-runner checks when the repo already exposes a script. Keep the test surface isolated and product-agnostic:

- Mount the smallest parent that owns the visual state instead of a deeply prop-driven child.
- Wrap only the providers the component actually reads: router, query client, theme, feature flags, or local context.
- Mock API data at the test/story boundary. Derive response shape from fixture/HAR/type usage; do not guess unknown response fields.
- For interactive components, encode pre-actions: click the drawer/menu trigger, select a tab, type into the invalid field, or advance the animation before capturing.
- Test desktop and mobile sizes when the component has responsive behavior.
- Assert at least one visible value or accessible control before taking a screenshot, so an empty render cannot pass as a visual baseline.
- Use short timeouts on the first iteration to expose missing providers or mocks quickly; remove the override once the surface is stable.

For visual claims, capture or report:

- Storybook URL or story ID.
- Viewport size.
- State being inspected.
- Console errors or missing assets.
- Screenshot path or a short screenshot summary.

For motion claims, also capture or report:

- The trigger used to start the motion.
- Whether the story can replay the motion deterministically.
- In-flight and settled visual states.
- Any reduced-motion behavior or gap.

## Agent Handoff Contract

When one agent prepares work for another, include:

- Repo, branch, and changed files.
- Source references used: Figma, Notion, Linear, screenshot, or code path.
- Exact Storybook story to open.
- Commands already run and their outcome.
- Remaining subjective design choices that need human confirmation.

Do not rely on agent-specific memory. Put durable instructions in the repo-owned skill, story, test, or ticket.

## Temporary Storybook Checkpoints

Temporary stories are acceptable for design confirmation when:

- The UI needs human visual approval before backend/auth/routing work.
- The real route is blocked by credentials, flags, data, or environment setup.
- Multiple agents need a stable isolated surface to inspect.

Before merge, remove the temporary story or convert it into a permanent story with realistic fixtures and useful states.
