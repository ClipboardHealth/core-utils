---
description: "Creating or managing feature flags: naming, lifecycle, SDK usage, Zod schemas"
---

# Feature Flags

**Naming:** `YYYY-MM-<feature-descriptive-name>` (e.g., `2026-09-new-booking-flow`).

## Required Metadata

When creating a flag, set the following tags and custom properties:

- Category tag: `category-experiment` (a metric readout decides) · `category-release` (engineering confidence decides) · `category-enable` (kill switch) · `category-configure` (runtime dial). Experiment and release are `temporary: true`; enable and configure `false`.
- `team-<name>` tag: Identify the owning team; update it when ownership changes
- `blast-*` tag: `blast-high` (money, safety, compliance, irreversible) · `blast-medium` (core user flow, many users, reversible) · `blast-low` (copy, cosmetics, internal tooling)
- `cb.domain` custom property: Identify the domain
- `cb.review-date` custom property: Set the next flag audit date — release 30 days, experiment 90, enable and configure 12 months
- `cb.ticket` custom property: the removal ticket, on `experiment` and `release` only
- `type-safe` tag and `cb.schema` custom property: on `configure` only
- `scheduled-deletion` tag: once the flag is slated for removal

## Lifecycle and Defaults

- "Off" = default/safer value
- Retain permanent flags only for runtime configuration. When a temporary flag becomes permanent configuration, update its category tag and metadata in place.
- Create the removal ticket when creating a temporary flag and record it in `cb.ticket`
- A `blast-high` change to a permanent flag requires an approval request before it applies
- Use `cb.review-date` to schedule audits and keep the flag's metadata current
- Validate staging before production
- Always provide default values in code
- Clean up flags that are no longer needed after launch

**When making feature flag changes**: include LaunchDarkly link: `https://app.launchdarkly.com/projects/default/flags/{flag-key}`

## SDK Usage

- Use `@clipboard-health/feature-flags` in backend, `useCbhFlag` in Worker mobile app; do not call LaunchDarkly SDKs directly
- Configuration flags must be type-safe: define a Zod schema, generate the LaunchDarkly variation schema from it with the `generate-flag-schema` skill, tag the flag `type-safe`, and record the schema's package and path in `cb.schema`
- Do not add LaunchDarkly `identify` calls in backend services; when a workplace-specific flag value is needed in a client app, evaluate it backend-side and return the result in the API response
- Use string LaunchDarkly user keys; ensure context kinds match targeting rules; client-side apps must use the `user` context kind
