---
name: clipboard-design-engineering
description: Use when a Clipboard frontend task involves UI polish, motion or animation decisions, interaction feel, small interaction details, visual hierarchy, component craft, or reviewing whether admin/mobile UI feels consistent with Clipboard's product and design-system standards.
---

# Clipboard Design Engineering

Use this skill when the UI already works functionally but still needs taste: spacing that holds up under dense data, motion that feels intentional, interaction states that respond immediately, and components that belong inside Clipboard's admin and mobile products.

Clipboard UI is operational software. People use it to scan, compare, decide, and repeat. The best visual work here is quiet. It makes state obvious, removes doubt, and keeps the user moving. Decoration that does not improve comprehension is noise.

## Core Philosophy

- **System first**: existing Clipboard components, stories, and theme tokens are the starting point. New visual patterns need a reason.
- **Evidence over vibes**: Figma and screenshots define intent. Storybook screenshots prove the implementation.
- **Density is a design constraint**: admin tables, cards, drawers, shift details, and mobile sheets must survive long names, translated copy, dense rows, empty states, and loading states.
- **Motion must earn its cost**: motion should explain state, preserve spatial continuity, show progress, or confirm input.
- **Frequent actions should feel instant**: if the user hits it all day, keep it crisp and almost invisible.
- **Rare moments can carry more feeling**: completion, education, and onboarding can be warmer, but never sloppy.

## Before Changing UI

1. Search existing components, stories, and theme tokens before creating a new visual pattern.
2. Prefer repo-owned design-system components over bespoke markup.
3. In admin redesign work, use Berlin/MUI `sx` with theme tokens.
4. In mobile redesign work, use the existing app V2 redesign components, Storybook decorators, and mobile viewport presets.
5. Add or update a Storybook story for any non-trivial visual, interaction, or animation change.

## Motion Decision Framework

Before adding animation, answer these in order:

1. **How often will this run?**
   - Keyboard-heavy or repeated actions: no motion, or near-instant feedback only.
   - Occasional actions such as drawers, dialogs, filters, and toasts: restrained motion.
   - Rare education or completion moments: more expressive motion is allowed.
2. **What does it explain?**
   - Good reasons: state change, spatial relationship, input feedback, progress, continuity.
   - Bad reason: it makes the mock feel more alive.
3. **What should the user feel?**
   - Admin surfaces should feel fast, stable, and trustworthy.
   - Mobile surfaces should feel responsive, thumb-friendly, and native enough.
   - Anything that delays decision-making is a regression.

## Motion Rules That Matter

- Do not animate keyboard-heavy or very frequent actions unless the motion is nearly instant and clearly improves feedback.
- Prefer no animation over slow animation.
- Keep most UI motion under 300ms. Longer motion needs a reason such as education, progress, or a rare completion moment.
- Use explicit transition properties. Do not use `transition: all`.
- Prefer `transform` and `opacity` for movement. Avoid animating layout properties such as width, height, top, and left unless the component has a measured reason.
- Entering UI should respond immediately. Slow starts make the product feel delayed.
- Moving UI should handle rapid user input. Prefer CSS transitions for state changes that can be redirected and reserve keyframes for predetermined loops or decorative sequences.
- Respect `prefers-reduced-motion`. Reduced motion can keep opacity/color transitions, but should remove or reduce position and transform movement.
- Gate hover-only motion behind real hover capability on touch-sensitive UI.
- Loading skeletons should match the final content shape and not resize the layout.
- Pressed states should acknowledge input immediately with a subtle visual response when the component style supports it.
- Popovers, menus, and anchored overlays should visually originate from the trigger. Dialogs and centered modals should stay centered.
- For stacked overlays such as drawers, side panels, dialogs, or bottom sheets over an existing surface, preserve spatial continuity: the parent layer should remain stable, the child layer should have a clear origin, and backdrop, focus, dismiss, and rapid re-open behavior should be inspectable.
- Loops and pulses need a stop condition or a strong reason. Persistent pulsing is usually visual debt.

## Component Feel Checklist

Check these before calling a UI polished:

- Text hierarchy scans correctly in the target viewport.
- Spacing uses theme tokens and matches nearby local patterns.
- Interactive elements have hover, active/pressed, focus-visible, disabled, and loading states where applicable.
- Touch targets are at least 44px on mobile.
- Long names, translated copy, dense data, and empty/error states do not break layout.
- Iconography, radius, borders, shadows, and colors match the local design-system usage.
- Loading, success, and error states are specific enough that the user knows what happened and what to do next.
- Motion communicates a state change, not just style.

## Anti-Slop Checks

Reject these patterns unless there is a very specific local reason:

- A new wrapper `Box` layer that only exists to make spacing guesses easier.
- A color copied from Figma instead of mapped to a theme token or named as a design-system gap.
- A story that only renders the happy path.
- A loading state whose skeleton does not match the final content footprint.
- A mobile sheet that looks fine at `390x844` but clips at `375x667`.
- A hover effect that fires on touch devices.
- An animation that cannot be replayed or inspected in Storybook.
- A "polished" component with no focus-visible state.
- Text that only works for the sample name or English copy.

## Storybook Evidence

For visual or motion claims, the Storybook story should make the claim inspectable:

- Include default, loading, empty, error, disabled, long-text, and dense-data states when relevant.
- Include mobile and desktop stories when the layout differs.
- For animation, include a replay control, deterministic key, or explicit in-flight state.
- For stacked overlay motion, include opened, child-opened, dismissed, and rapid re-open states so layering and focus handoff are visible before product integration.
- For Figma work, attach the Figma URL with `parameters.design` when the repo supports `@storybook/addon-designs`.
- Verify the story in a browser-controlled surface and report the story URL, viewport, state, and any console errors.

## Review Output

When reviewing UI polish, use this table format. Keep the rows concrete enough that another agent can patch the code without guessing.

| Before                                           | After                                                                            | Why                                                             |
| ------------------------------------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `transition: all 300ms`                          | `transition: transform 180ms ease-out, opacity 180ms ease-out`                   | The moving properties are explicit and easier to verify.        |
| A bottom sheet that only exists in the app route | A Storybook story with default, loading, long-copy, and repeatable motion states | Visual feedback stays cheap before integration work.            |
| A custom color copied from Figma                 | The closest repo theme token or a named design-system gap                        | Clipboard UI should stay tied to the shared system.             |
| One beautiful happy-path card                    | Stories for default, dense data, long text, empty, error, and loading            | Product UI breaks first at the edges.                           |
| Hover-only affordance on mobile                  | Press/focus/tap states that work without hover                                   | Most mobile users never get a real hover state.                 |
| Animation judged from code                       | Storybook replay plus screenshot or short video evidence                         | Motion quality is a rendered behavior, not a code-style belief. |

If the right answer depends on taste or a missing design-system token, stop and ask for human confirmation with the Storybook URL and the exact ambiguity.
