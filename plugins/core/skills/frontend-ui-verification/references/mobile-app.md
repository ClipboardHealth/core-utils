# Mobile App Verification Notes

Use this reference for `cbh-mobile-app`.

## Source Locations

- App V2 code lives under `src/appV2/**`.
- Redesign mobile surfaces live under `src/appV2/redesign/**`.
- Shared redesign components live under `src/appV2/redesign/components/**`.
- Storybook config lives in `.storybook/`, with extra decorators under `src/appV2/.storybook/decorators/**`.
- Stories are discovered from `src/**/*.stories.@(js|jsx|ts|tsx)` and `src/**/*.mdx`.
- Many redesign stories live under `src/appV2/redesign/stories/**`; component-specific stories may also be colocated near the component.

## Existing Storybook Setup

The mobile Storybook is React Vite based and includes:

- `@storybook/addon-designs` for attaching Figma/design references.
- `@storybook/addon-interactions` for interaction stories.
- A `design-system` Storybook ref named `CBH Core Design System` at `https://cbh-core.cbh.rocks/`.
- Static assets from `public` and `src/assets`.
- Vite TypeScript path support, SVG support, and node polyfills.

Common commands:

```bash
npm run storybook
npm run storybook:build
```

As of the repo audit, these are the native visual-layer scripts detected for mobile. Use the app server or device runtime only after the Storybook surface is visually sound and the work moves into product integration.

Use this as the primary visual verification server:

```text
http://localhost:6006/
```

Story URLs usually follow this shape:

```text
http://localhost:6006/?path=/story/<story-id>
```

Direct canvas URLs are useful for screenshots:

```text
http://localhost:6006/iframe.html?viewMode=story&id=<story-id>
```

If port `6006` is busy, use the alternate port Storybook prints and report that exact URL in the handoff.

The global preview wraps stories with:

- `SnackbarProviderDecorator`
- `ReactQueryDecorator`
- `MuiThemeDecorator`
- `RouterDecorator`
- `SegmentPluginDecorator`

Use local story decorators when a redesign surface needs a different provider. Existing examples use:

- `RedesignMuiThemeDecorator` from `src/appV2/.storybook/decorators/ShiftDiscoveryMuiTheme` for redesign UI.
- `MockWorkerDecorator` for stories that need worker query data.
- `CustomRouteDecorator` for route-dependent components.
- `GoogleMapsDecorator` for Google Places autocomplete behavior.
- `KnockGuideProviderDecorator` for Knock guides.

## Mobile Screen Sizes

The Storybook preview already defines these useful screen sizes:

- `iPhoneSE`: `375x667`
- `iPhone12`: `390x844`
- `pixel6`: `412x915`
- `iPadMini`: `768x1024`
- `smallScreen`: `420x300`

Default visual inspection should include the default `iPhone12`, the smallest relevant phone viewport, and `iPadMini` when layout may stretch.

## Story Requirements

Prefer stories that render the real mobile shell or bottom-sheet/card/list composition with realistic fixture data. Good local patterns include:

- `src/appV2/Connectivity/OfflineIndicator.stories.tsx`
- `src/appV2/PostShiftReview/PostShiftReviewFlowContent.stories.tsx`
- `src/appV2/redesign/stories/**`
- `src/appV2/redesign/Placements/components/PlacementCard/PlacementCardV2.stories.tsx`
- `src/appV2/redesign/EmergencyCredits/components/CreditProgressBar.stories.tsx`

Temporary design checkpoint stories may render the full proposed UI before app wiring. Use them to iterate, capture screenshots, and get user sign-off. After integration, delete them unless they have become useful permanent generic/component/state stories.

When a story maps to a Figma node, attach the design reference in Storybook:

```typescript
parameters: {
  design: {
    type: "figma",
    url: "https://www.figma.com/design/...",
  },
}
```

For mobile redesign work, verify:

- Bottom sheets, dialogs, sticky footers, safe-area spacing, and keyboard overlap.
- Long workplace names, worker names, addresses, rates, dates, and translated-copy expansion.
- Loading, empty, offline, retry, permission-denied, disabled, and submitted states.
- Tap target size, focus order, scroll boundaries, and hidden overflow.
- Whether a component should be mobile-specific or shared content inside a mobile shell.
- If animation is part of the UI, provide a story control to replay it or render the in-flight state. `CreditProgressBar.stories.tsx` is a good local pattern.

Avoid live network/auth dependencies in stories. Mock query data or pass fixture props at the story boundary.

Mobile redesign lint/style constraints to preserve:

- Use design-system or MUI components instead of raw `div` and `span` in redesign code.
- Avoid raw hex colors; use theme variables.
- Use `getStoryBackgrounds()` when a story needs the standard light/dark background set.
- Keep mobile app verification in Storybook for visual work. Capacitor-only behavior, native permissions, push, deep links, and true device APIs are post-verification concerns.

## Out of Scope

Do not use this skill to solve full workflow E2E coverage, product-environment setup, or Capacitor device behavior. Those belong to the later post-verification layer after the Storybook visual surface has been reviewed.

Report separately:

- Storybook visual evidence.
- Any device capability gap, such as camera, location access, push, deep links, or Capacitor-only behavior.
