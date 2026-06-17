---
name: frontend-ui-verification
description: Use when a Clipboard frontend task involves a new UI idea, Figma/design URL, screenshot, redesign UI, design-to-code implementation, Storybook visual validation, Playwright/browser screenshot, animation/motion visual proof, or preventing design-system and visual-fidelity drift in admin or mobile UI work.
---

# Frontend UI Verification

Use this skill for UI work where visual fidelity, design-system reuse, responsive behavior, or human review matters. The goal is to make frontend visual changes cheap to inspect before real integration makes feedback slow and expensive.

## Core Rule

Code is the source of truth for available components, story patterns, and design-system usage. Design references are the source of truth for intended appearance and behavior. Do not invent components, wrappers, or design tokens until you have searched the repo and checked the relevant design/reference source.

Keep this as a cheap visual layer. Use repo rules and agent judgment for routine React implementation details. Be prescriptive only where agents commonly drift: choosing the reference source, finding existing components, creating an isolated Storybook surface, managing the Storybook server lifecycle, opening the exact canvas URL, capturing browser evidence, classifying console findings, and deleting temporary checkpoint stories.

## Required Workflow

1. **Identify the surface**
   - Determine repo and surface: admin web, mobile web/app, shared package, or another frontend.
   - Identify the strongest available reference source:
     - Figma/design URL: fetch screenshot, design context, variables/tokens, metadata, and design-system/Code Connect mappings when available. If the URL is inaccessible, falls behind login, or returns an error, ask for an export/screenshot or treat the work as screenshot/written-idea based; do not claim exact Figma fidelity without design evidence.
     - Screenshot/image: use it as the visual reference, and call out missing states, viewport, or interaction details.
     - Written idea only: do not block. Search existing components and stories, choose the closest Clipboard pattern, build a Storybook checkpoint, and ask for confirmation before deeper integration if the visual interpretation is subjective.
     - No visual reference: derive from nearby product patterns and design-system components, then verify the proposed interpretation in Storybook before product integration.
   - Classify visible UI work as design-first: implement the smallest inspectable surface, verify it visually, then move to product integration.

2. **Find the existing pattern first**
   - Search for existing components, stories, hooks, fixtures, and nearby feature folders before creating anything.
   - In `cbh-admin-frontend`, prefer `src/appV2/redesign/**` and Berlin components from `src/appV2/redesign/components/**`.
   - Reuse existing Clipboard components, tokens, layouts, decorators, and story patterns whenever they satisfy the job.
   - Add a new component only when existing components cannot express the needed UI without awkward composition.
   - Create a generic shared component only when it is reusable across multiple surfaces and matches the established component API style. Otherwise keep it feature-local.
   - Keep reusable components loosely coupled: pass primitive/domain props, not raw API response objects.

3. **Build an isolated verification surface**
   - For meaningful visual work, build or update the visual slice in Storybook before product integration.
   - Use a temporary story when the goal is to validate a design slice before wiring backend/auth/routing. It is acceptable for this story to contain the full proposed UI composition with fixtures while the real product code is still being shaped.
   - Iterate inside Storybook: apply visual feedback, retake screenshots, and keep refining until the Storybook surface matches the reference or the human confirms the interpretation.
   - After the UI is integrated, delete temporary checkpoint stories. Keep only stories that are useful permanent documentation: generic components, reusable compositions, or important product states.
   - Cover the states the user would naturally inspect: default, loading, empty, error, disabled, long text, dense data, permission/flag variants, and desktop/mobile variants when the design differs.
   - For drawers, menus, popovers, steppers, tabs, forms, and animated UI, make the story render deterministic pre-action states such as closed, opened, selected, invalid, in-flight, and settled.
   - Mock data at the story boundary. Do not force live API, auth, or route setup just to inspect visual composition.

4. **Verify with browser evidence**
   - Run the repo Storybook server as the primary visual verification surface.
   - Start long-running Storybook servers in a process you can stop. In CLI or prompt-command validation, redirect logs to `/tmp`, record the server PID, and stop it before the final report. Do not leave a foreground dev server blocking screenshot capture, cleanup, or the final response.
   - Open the exact story in a browser-controlled surface. Prefer the active Browser/Chrome tool when available; otherwise use Playwright against the Storybook URL.
   - If the Storybook UI shell is noisy, open the canvas URL directly with `iframe.html?viewMode=story&id=<story-id>`.
   - Use native Storybook test/a11y or component-level Playwright scripts only when the repo already exposes them. Do not invent a new harness for this layer.
   - Check console errors, layout overflow, text clipping, loading/empty states, keyboard/interaction cues, and desktop/mobile viewport sizes.
   - Classify console findings as story-introduced, provider/decorator gaps, or pre-existing/global Storybook warnings. Fix story-introduced errors before proceeding; report global warnings separately instead of hiding them.
   - If motion or animation is part of the change, verify the motion in Storybook with a repeatable or controllable story, then capture evidence after the animation starts and after it settles.
   - Capture screenshots when visual fidelity is part of the claim. For Figma work, compare the Storybook screenshot against the Figma screenshot element by element.
   - If the design is non-trivial or the user needs sign-off, share the Storybook URL and screenshot summary, then wait for confirmation before deeper integration.

5. **Do not give up on visual access early**
   - Run the helper's `inspect` command first when the repo command, build command, or story URL shape is unclear.
   - If the Storybook dev server fails, try the repo's Storybook build command and inspect the built Storybook when practical.
   - If port `6006` is busy, use the alternate port Storybook prints and report that exact URL.
   - If the story fails because of providers, routing, API data, or feature context, fix the story with decorators or fixture props instead of switching to product integration.
   - If one browser tool fails, try another available browser path: Browser plugin, Chrome, Playwright CLI/script, or the agent's equivalent.
   - Stop only after at least two reasonable Storybook access paths fail, and report the exact command, URL, error, and what evidence is missing.

6. **Ask for human confirmation at the right time**
   - Ask before choosing between multiple plausible visual interpretations.
   - Ask after a temporary Storybook checkpoint when the user requested exact visual match, when the reference is subjective, or when the design changes layout density/hierarchy.
   - Ask before adding a new generic component unless there are at least two concrete reuse sites or an existing design-system gap.
   - Do not ask for routine wiring details once the Storybook surface clearly matches existing patterns.

7. **Hand off after the visual surface is sound**
   - If the UI is simple and maps directly to existing components, proceed to integration after visual inspection.
   - Treat full product workflow checks as a separate post-verification layer.
   - Do not expand this skill into full-flow Playwright or product-environment work.

8. **Final verification report**
   - List the reference source used: Figma/Notion/screenshot/written idea/story/code path.
   - List the Storybook URL checked.
   - List viewport sizes and states verified.
   - State any unresolved visual ambiguity, missing source reference, or verification gap.

## When to Stop and Ask

Stop before continuing if:

- Figma/design docs conflict with current code patterns.
- A new generic component seems necessary but reuse is not proven.
- The visual match depends on a subjective choice the reference does not answer.
- A Figma URL is provided but no Figma screenshot, metadata, or design context can be fetched.
- You cannot render the Storybook story or capture useful evidence.
- User approval is needed after a temporary Storybook checkpoint.

## Reference Files

- Admin app details: read [`references/admin-app.md`](./references/admin-app.md) when working in `cbh-admin-frontend`.
- Mobile app details: read [`references/mobile-app.md`](./references/mobile-app.md) when working in `cbh-mobile-app`.
- Tooling details: read [`references/tooling.md`](./references/tooling.md) when using Figma, Notion, Linear, Storybook, browser screenshots, or another agent environment.
- For motion-heavy UI, also apply the `clipboard-design-engineering` skill if it is available.

## Helper Script

Script paths below are written as `scripts/...`, relative to this `SKILL.md`, matching the other core skills such as `babysit-pr`.

Use the helper before visual work to make the verification surface deterministic:

```bash
bash scripts/inspect-ui-verification-surface.sh inspect
```

Use these subcommands when an agent needs exact values instead of prose:

```bash
bash scripts/inspect-ui-verification-surface.sh storybook-command
bash scripts/inspect-ui-verification-surface.sh storybook-build-command
bash scripts/inspect-ui-verification-surface.sh storybook-test-command
bash scripts/inspect-ui-verification-surface.sh component-test-command
bash scripts/inspect-ui-verification-surface.sh storybook-url <story-id>
bash scripts/inspect-ui-verification-surface.sh storybook-iframe-url <story-id>
bash scripts/inspect-ui-verification-surface.sh figma-story-files
```

When running manually from a frontend repo instead of through host skill resolution, use the installed skill path, for example `.agents/skills/frontend-ui-verification/scripts/inspect-ui-verification-surface.sh`.
