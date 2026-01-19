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
