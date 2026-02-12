# Feature Flags

**Naming:** `YYYY-MM-[kind]-[subject]` (e.g., `2024-03-release-new-booking-flow`)

| Kind         | Purpose                  |
| ------------ | ------------------------ |
| `release`    | Gradual rollout to 100%  |
| `enable`     | Kill switch              |
| `experiment` | Trial for small audience |
| `configure`  | Runtime config           |

**Rules:**

- "Off" = default/safer value
- No permanent flags (except `configure`)
- Create archival ticket when creating flag
- Validate staging before production
- Always provide default values in code
- Clean up after full launch
- Tag flags with owning team (not in key name)

**When making feature flag changes**: include LaunchDarkly link: `https://app.launchdarkly.com/projects/default/flags/{flag-key}`

## SDK Usage

- Use `@clipboard-health/feature-flags` in backend, `useCbhFlag` in Worker mobile app; do not call LaunchDarkly SDKs directly
- Configuration flags must be type-safe: define a Zod schema in the validation map, and tag the flag `type-safe` in LaunchDarkly
- Do not add LaunchDarkly `identify` calls in backend services; when a workplace-specific flag value is needed in a client app, evaluate it backend-side and return the result in the API response
- Use string LaunchDarkly user keys; ensure context kinds match targeting rules; client-side apps must use the `user` context kind
