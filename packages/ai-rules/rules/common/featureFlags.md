---
description: "Creating or managing feature flags: naming, lifecycle, SDK usage, Zod schemas"
---

# Feature Flags

Follow [BP: Feature Flags](https://app.notion.com/p/BP-Feature-Flags-3d68643321f481c3ab26d0176b706d03), updated [September 25, 2026](https://clipboardhealth.slack.com/archives/C03GWA3J1NY/p1790353920666269).

**Naming:** `YYYY-MM-<feature-descriptive-name>` (e.g., `2026-09-new-booking-flow`). Store the category and owning team in tags, not in the key, so they can change without replacing the flag.

## Required Metadata

Use the BP's allowed category and blast-radius values; do not invent tag values.

| Tag or custom property           | Purpose                                                    |
| -------------------------------- | ---------------------------------------------------------- |
| Category tag                     | Classify the flag's purpose and lifecycle                  |
| `team-<name>` tag                | Identify the owning team; update it when ownership changes |
| `blast-*` tag                    | Describe the risk of changing the flag                     |
| `cb.domain` custom property      | Identify the domain                                        |
| `cb.review-date` custom property | Set the next flag audit date                               |

## Lifecycle and Defaults

- "Off" = default/safer value
- Retain permanent flags only for runtime configuration. When a temporary flag becomes permanent configuration, update its category tag and metadata in place instead of deleting and recreating it.
- Create archival ticket when creating flag
- Use `cb.review-date` to schedule audits and keep the flag's metadata current
- Validate staging before production
- Always provide default values in code
- Clean up flags that are no longer needed after launch

**When making feature flag changes**: include LaunchDarkly link: `https://app.launchdarkly.com/projects/default/flags/{flag-key}`

## SDK Usage

- Use `@clipboard-health/feature-flags` in backend, `useCbhFlag` in Worker mobile app; do not call LaunchDarkly SDKs directly
- Configuration flags must be type-safe: define a Zod schema in the validation map, and tag the flag `type-safe` in LaunchDarkly
- Do not add LaunchDarkly `identify` calls in backend services; when a workplace-specific flag value is needed in a client app, evaluate it backend-side and return the result in the API response
- Use string LaunchDarkly user keys; ensure context kinds match targeting rules; client-side apps must use the `user` context kind
