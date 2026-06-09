# Admin App Verification Notes

Use this reference for `cbh-admin-frontend`.

## Source Locations

- Redesign features live under `src/appV2/redesign/**`.
- Shared Berlin components live under `src/appV2/redesign/components/**`.
- Storybook config lives in `.storybook/`.
- Stories are discovered from `src/**/*.stories.@(js|jsx|ts|tsx)` and `src/**/*.stories.mdx`.
- Existing app rules require user-facing copy in redesign code to use `useTu(namespace).tu(...)`.
- PHI shown in UI must be masked with `data-dd-privacy="mask"`.
- Feature folders usually follow `api/`, `components/`, `hooks/`, `utils/`, plus container/view files, `types.ts`, `constants.ts`, and `paths.ts`.

## Existing Storybook Setup

The admin Storybook is React Vite based. `.storybook/main.ts` discovers all `src/**/*.stories.*`, serves `public`, uses `@storybook/addon-essentials`, `@storybook/addon-a11y`, and `@storybook/addon-links`, supports SVG imports, and mocks `@src/mobile/utils/openUrl` with `.storybook/mocks/openUrl.ts`.

The global preview already wraps stories with:

- `MemoryRouter`
- `QueryClientProvider`
- `BerlinThemeProvider`

That means most visual stories should use the existing Storybook instead of a custom preview app. Add local decorators only for extra providers such as MUI date pickers, feature-specific contexts, or fixed-width containers.

Common commands:

```bash
npm run storybook
npm run build-storybook
```

As of the repo audit, these are the only native visual-layer scripts detected for admin. Use the app server only after the Storybook surface is visually sound and the work moves into product integration.

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

## Story Requirements

For visual feature work, prefer one of these story shapes:

- Component primitive story: all variants, sizes, disabled/loading/error states.
- Feature composition story: realistic fixture data showing the component in its card, drawer, modal, page section, or mobile shell.
- Temporary design checkpoint story: a focused story that renders the full proposed UI before app wiring. Use it to iterate, capture screenshots, and get user sign-off. After integration, delete it unless it has become a useful permanent generic/component/state story.

Stories should avoid live network/auth dependencies. If the real component requires API context, compose lower-level presentational pieces with realistic fixture data, as existing `DailyView`, `Calendar`, `Chat`, and `WorkerDocuments` stories do.

Good local patterns:

- `src/appV2/redesign/Calendar/Daily/Mobile/Layout.stories.tsx`: fullscreen mobile layout, fixed story date, realistic panes, local full-height decorator.
- `src/appV2/redesign/DailyView/components/ShiftPostingForm/ShiftPostingForm.stories.tsx`: visual composition story for an API-bound form, using lower-level pieces and a Figma reference comment.
- `src/appV2/redesign/DailyView/components/ValidationModals/RushFeeDialog.stories.tsx`: modal state coverage with mobile viewport parameters.

## Design-System Checks

Before creating new UI, search for:

```bash
rg "export function .*" src/appV2/redesign/components
find src/appV2/redesign -name '*.stories.tsx'
rg "title: .*<feature-or-component>" src/appV2/redesign -g '*.stories.tsx'
```

Check whether existing components already cover the need:

- `Button`, `IconButton`, `Text`, `TextInput`, `SearchInput`
- `Chip`, `Tag`, `Badge`, `Pill`, `StatusDot`
- `Dialog`, `ResponsiveDialog`, `Drawer`, `SidePanel`, `BottomSheet`
- `Tabs`, `SegmentedControl`, `DataGrid`, `PageLayout`
- `InfoBanner`, `AcknowledgementBanner`, `NotificationCard`

Use MUI `sx` with theme tokens. Avoid ad hoc CSS files, hardcoded colors, raw pixel spacing when a theme token exists, and wrapper `Box` layers that do not add layout value.

Admin styling and component rules to preserve:

- Use `BerlinThemeProvider`, not legacy theme providers, for new redesign surfaces.
- Use `sx` with theme tokens and full property names such as `padding`, `paddingX`, `marginY`.
- Keep presentational components API-light: pass primitives or domain props, not raw API response objects.
- Register every new or updated shared UI component in Storybook with a `Default` story first and useful controls.

## Storybook Browser Verification

For non-trivial visual changes, inspect at least:

- Mobile: `375x812`
- Tablet or narrow desktop when relevant: `768x1024`
- Desktop: `1440x900`

Check:

- No clipped text or horizontal overflow.
- Loading, empty, disabled, error, and dense-data states.
- Long names, long labels, and translated-copy expansion.
- Keyboard and pointer cues for interactive elements.
- Console errors and missing assets.
- Motion and animation states when present: initial, active/in-flight, settled, and reduced-motion behavior when practical.
- Feature flag and route behavior only after Storybook looks correct.

## Out of Scope

Do not use this skill to solve full workflow E2E coverage or product-environment setup. Those belong to the later post-verification layer after the Storybook visual surface has been reviewed.
