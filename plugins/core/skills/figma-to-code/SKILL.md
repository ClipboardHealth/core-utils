---
name: figma-to-code
description: "Implement UI from a Figma design. Use when the user shares a Figma URL, asks to implement a design, or says things like 'build this from Figma', 'match this design', 'implement this Figma', or 'figma to code'."
argument-hint: "<figma-url>"
---

# Figma to Code

Fetch a Figma design, map it to the project's existing components and theme tokens, and produce production-ready code that matches the design.

## Arguments

- `$ARGUMENTS` - Figma URL (e.g., `https://www.figma.com/design/:fileKey/:fileName?node-id=:nodeId`). Required.

## Step 1: Fetch the Design

Extract `fileKey` and `nodeId` from the Figma URL:
- `figma.com/design/:fileKey/:fileName?node-id=:int1-:int2` → nodeId = `int1:int2` (convert `-` to `:`)
- `figma.com/design/:fileKey/branch/:branchKey/:fileName` → use branchKey as fileKey

Call `mcp__claude_ai_Figma__get_design_context` with:
- `fileKey` and `nodeId` from the URL
- `clientFrameworks`: detect from the project (e.g., "react", "vue", "angular")
- `clientLanguages`: detect from the project (e.g., "typescript", "javascript")

## Step 2: Interpret the Design (DO NOT generate code yet)

The Figma MCP returns **reference code** (typically React+Tailwind) plus a screenshot. This is a starting point, NOT final code.

Before writing any code:

1. **Study the screenshot** — this is the source of truth for what to build
2. **Ignore hidden elements** — Figma nodes with `visible: false` or `opacity: 0` are design-time helpers (bounding boxes, redline guides, hidden variants). Do NOT implement them.
3. **Read `data-annotations`** — these contain implementation hints from designers (e.g., which menu items to show, interaction behaviors, conditional states)
4. **Identify existing components** — search the project's component library for matches before creating anything new. Use Grep/Glob to find component files.
5. **Map design tokens** — identify the project's theme/token system and map Figma's CSS variables to it
6. **Compare screenshots** — if the user provided a screenshot alongside the URL, compare it with the Figma screenshot to understand what's currently implemented vs what needs to change

## Step 3: Discover the Project's Design System

Before implementing, understand the project's existing patterns:

### 3a: Find the Component Library

```
Search for: Button, IconButton, Icon, Avatar, Text, Dialog, Modal components
Look in: src/**/components/, src/**/ui/, src/**/design-system/
```

For each Figma element, find the matching project component. Prefer reusing existing components over creating new ones.

### 3b: Find the Theme/Token System

```
Search for: theme.ts, tokens.ts, variables.css, tailwind.config
Look for: color palette, spacing scale, border radius, typography, shadows
```

Map every Figma design token (CSS variables like `--token-name`) to the project's equivalent.

### 3c: Find the Icon Registry

```
Search for: icon type definitions, icon name enums, SVG imports
Verify each icon name exists before using it
```

### 3d: Identify the Styling Approach

Determine which styling system the project uses:
- MUI `sx` prop
- Tailwind CSS
- CSS Modules
- styled-components
- Vanilla CSS/SCSS

**Use whatever the project uses. Never mix approaches.**

## Step 4: Implementation Rules

### Universal Rules (apply to ALL projects)

1. **Never hardcode colors** — always use theme tokens / CSS variables
2. **Never hardcode spacing** — use the project's spacing scale
3. **Never use Figma asset URLs in code** — they expire in 7 days. Download SVGs and register them as icons if new.
4. **Respect existing patterns** — if the project extracts components to files, don't use inline JSX variables. If the project uses a Container/View pattern, follow it.
5. **Check the rules** — read any `.rules/`, `AGENTS.md`, `CLAUDE.md`, or similar project instruction files for coding conventions

### React + MUI Projects (common at CBH)

- Use `sx` prop for styling, never CSS/SCSS/styled()/makeStyles()
- Use `(theme) => ({...})` callback for type-safe theme access
- Use `isDefined()` from `@clipboard-health/util-ts` for null checks, not truthy checks
- Never extract JSX into local variables — inline or extract to a separate component
- Follow Container/View pattern: Container fetches data, View is pure presentation

### Responsive Design

- Check if the Figma has mobile and desktop variants
- Use the project's responsive hooks/breakpoints
- Mobile typically uses bottom sheets / stacked layouts
- Desktop typically uses side panels / horizontal layouts

## Step 5: Verify the Implementation

After writing code:

1. **Run typechecks** — ensure no type errors
2. **Run tests** — ensure existing tests still pass
3. **Grep for hardcoded values** — search new code for `#`, `rgb(`, `rgba(`, hardcoded pixel values that should use tokens
4. **Compare with Figma screenshot** — visually verify the implementation matches the design element by element
5. **Check for hidden Figma properties** — ensure no invisible/hidden elements were accidentally implemented

## Common Figma-to-Code Pitfalls

1. **Custom spacing scales** — many projects use non-standard spacing (not 8px base). Check `theme.spacing` before converting.
2. **Figma returns Tailwind** — the reference code uses Tailwind classes. Convert every class to the project's styling system.
3. **Figma returns `<img>` for icons** — replace with the project's Icon component.
4. **Asset URLs expire** — `figma.com/api/mcp/asset/*` URLs expire in 7 days. Never use in production.
5. **Annotations are instructions** — `data-annotations="documents, chat, download badge"` means the menu should contain those items. Don't render the annotation text.
6. **Design tokens as CSS variables** — `var(--berlin/padding/small, 5px)` means use the project's equivalent of 5px spacing, not literally `5px`.
7. **Multiple Figma variants** — a single node may represent different states (hover, active, disabled). Check for variant props in the reference code.
