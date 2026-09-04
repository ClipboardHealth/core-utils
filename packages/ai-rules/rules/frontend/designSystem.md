---
description: "Implementing UI from the design system or Figma: prefer shared components, theme lookup, optional Code Connect"
---

# Design System

There is no shared design-system package across Clipboard frontend apps. Each repo owns its own
theme and components. Prefer those over hand-rolled UI.

## Resolve from the repo's code

1. Look up tokens and components in this repo's theme / design-system source (paths in `OVERLAY.md`).
2. Theme and component code are authoritative. If a `.rules` doc disagrees, trust the code and flag
   the rule as stale — do not invent or restate token hex/values from memory or docs.

Repo-specific import paths, mapped components, and Code Connect status live in that repo's
`OVERLAY.md`. Do not assume Workplace and Worker share the same tree or APIs.

## Figma / Code Connect (when present)

Some repos publish Figma Code Connect mappings (`*.figma.ts`); others have none. Do **not** assume
mappings exist, and do not open `.figma.ts` files unconditionally.

When implementing from a Figma frame:

1. If this repo has Code Connect mappings, check whether the frame (or its library component) is
   already mapped before inventing an implementation.
2. When Figma MCP returns a `CodeConnectSnippet`, use its import path and props **verbatim** —
   do not re-infer variants, sizes, or import paths from the visual design.
3. If there is no mapping (or the repo has zero Code Connect), implement from the repo's existing
   design-system components and theme code instead.
