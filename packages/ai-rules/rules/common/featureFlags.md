---
description: "Creating or managing feature flags: naming, lifecycle, SDK usage, Zod schemas"
---

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

## Experiments

Experiments are created through the experiment agent, which registers them automatically. Flags created by hand are caught by a weekly review.

**Recognize:** `experiment`-kind flags, and `release`-kind flags that carry a holdback/control arm, are experiments. `enable` and `configure` are not.

**Tags:** the agent sets `experiment` on registered experiments and `not-an-experiment` on reviewed ops/config flags. The owning-team tag is unchanged.

**Description block** (agent-written; keeps the flag self-describing):

    owner: <person>
    brief: <url>
    primary_metric: <canonical key>
    guardrails: <canonical keys>
    unit: worker | workplace | msa | cluster | time-switchback
    readout: YYYY-MM-DD
    kill: <one line>
    registry: <registry url>

**Randomization unit → context** (`user` = worker via `userType: "Agent"`, workplace via `"Facility"`, both carry `msa`; the `workplace` kind carries `metropolitanStatisticalArea`):

- worker / workplace: bucket by entity `key`
- msa: target the whole `msa`
- cluster (postal): target the cluster's MSA set where clusters are MSA-aligned, otherwise a managed segment per cluster synced from the cluster table (there is no native cluster attribute)
- time-switchback: alternate by time window

**Lifecycle:** no experiment goes live without `readout` and `kill`; experiments past `readout` with no decision are flagged; temporary flags left live long after creation are experiment debt (clean up per the rule above).
