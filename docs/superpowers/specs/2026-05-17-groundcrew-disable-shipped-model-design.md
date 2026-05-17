# Groundcrew — Disable a shipped default model

**Date:** 2026-05-17
**Plan reference:** `~/plans/2026-05-17-groundcrew-followup-fixes.md` §4 — "`crew doctor` is hard to use as a CI gate when shipped defaults aren't installed"
**Chosen option:** §4 Option B, shape 2 (`disabled: true` per-model)
**Scope:** Single PR. Estimated ~30 lines of production code in one file plus tests.

## Problem

`@clipboard-health/groundcrew` ships two default model definitions in `DEFAULT_MODEL_DEFINITIONS` (`packages/groundcrew/src/lib/config.ts:220-231`): `claude` and `codex`. Both are merged into every resolved config additively, which means:

- `crew doctor` always probes for both CLIs on `PATH`. A user who only routes work through `agent-claude` still fails doctor's required-check tier when `codex` is not installed, because the codex binary token is gathered from every model's `cmd` (`packages/groundcrew/src/commands/doctor.ts:103-113`).
- This makes `crew doctor || exit 1` unusable in CI for the common single-model case.

Documentation in PR #663 calls this out as a gotcha, but the exit code remains misleading.

## Goal

Give the user a single config-level lever to remove a shipped default from the merged result, so that doctor, dispatch, eligibility, and label resolution all behave as if the disabled model were never declared.

## Non-goals

- Adding a `crew doctor --models <list>` CLI flag (§4 Option A).
- Re-tiering doctor's exit codes (§4 Option C).
- Auto-fallback of `models.default` when the default is disabled (rejected during brainstorming as too magical).
- Changes to label-resolution fallback in `boardSource.ts` (existing behavior is preserved by design).

## User-facing shape

```ts
// config.ts
export default {
  // …
  models: {
    default: "claude",
    definitions: {
      codex: { disabled: true },
    },
  },
};
```

That is the only valid form of a disabled entry: `disabled: true` and nothing else.

## Semantics

After config resolution, a disabled model is **absent** from `ResolvedConfig.models.definitions`. It is not a separate state to be checked at each consumer; it simply does not exist downstream.

Specifically:

| Consumer         | Path                                                       | Behavior with disabled codex                                                                                                                 |
| ---------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `doctor`         | `gatherToolTokens()` iterates `Object.values(definitions)` | Codex binary token never gathered → no codex check → doctor passes when only claude is installed                                             |
| `eligibility`    | `Object.keys(definitions)`                                 | Codex never appears as a dispatch candidate                                                                                                  |
| `boardSource`    | `Object.hasOwn(definitions, "codex")`                      | Returns false; an `agent-codex` ticket falls back to `models.default` exactly as it would for any unknown agent label (`boardSource.ts:411`) |
| `setupWorkspace` | `definitions[model]` lookup                                | Returns `undefined`; existing missing-model error path applies                                                                               |
| `usage`          | iterates definitions for codexbar gating                   | Codex never contributes to usage state                                                                                                       |

This filter-don't-flag posture means no consumer needs an `if (!definition.disabled)` guard, which in turn means no future consumer can forget one.

## Validation — three loud-failure cases

All errors go through the existing `fail()` helper so they carry the `groundcrew config:` prefix.

### 1. `disabled` combined with other fields

```ts
{ codex: { disabled: true, cmd: "x" } }
```

→ `models.definitions.codex: cannot combine \`disabled: true\` with other fields (cmd, color, usage). Either disable the model or override its fields, not both.`

Rationale: ambiguous intent. Forces the user to express one operation per entry.

### 2. `disabled` on a key that isn't a shipped default

```text
{ codexx: { disabled: true } }   // typo of "codex"
```

→ `models.definitions.codexx: \`disabled: true\` is only valid for shipped defaults (claude, codex). Remove the entry instead.`

Rationale: catches typos at config-load time. Without this guard, the typo silently disables nothing and the user finds out only when doctor still complains about codex.

The list of shipped defaults in the error message is derived from `Object.keys(DEFAULT_MODEL_DEFINITIONS)` so it stays accurate if the shipped set changes.

### 3. `models.default` points at a disabled model

```ts
models: { default: "codex", definitions: { codex: { disabled: true } } }
```

→ `models.default ("codex") is disabled. Either re-enable it or set models.default to an enabled model.`

Rationale: the existing validation at `config.ts:661-664` (`models.default ("codex") is not a key in models.definitions`) would technically fire, but it tells the user the wrong story — they _did_ declare codex, they just disabled it. The new check must run before the existing one so the more specific message wins.

### Shape validation

`disabled`, when present, must be exactly the boolean `true`. `false`, `0`, `"true"`, and other truthy/falsy values fail with a shape-style error: `models.definitions.codex.disabled must be exactly \`true\` when set`. No tri-state semantics — the flag is strictly true-or-absent.

## Implementation outline

All changes live in `packages/groundcrew/src/lib/config.ts`. Estimated diff: ~30 lines of production code.

### 1. Type — `UserModelDefinition` (config.ts:77)

```ts
type UserModelDefinition = Partial<ModelDefinition> & { disabled?: boolean };
```

`ModelDefinition` (the resolved shape, config.ts:51-66) is **not** changed. `disabled` is purely an input-time concept.

### 2. Input validation — extend the existing guard

The current `failIfLegacyModelKeys()` (config.ts:464-481) is the natural place to add per-entry shape rules. It already rejects legacy `isolation` and `sandbox` keys. Add:

- If `disabled` is present and not `=== true`, fail with the shape error.
- If `disabled === true` and any of `cmd`/`color`/`usage` is also present, fail with case 1's message.

(Stylistic note: the function's name skews negative. A small rename to e.g. `validateUserModelDefinition` is optional polish and not load-bearing.)

### 3. Filter logic — `mergeDefinitions()` (config.ts:483-525)

Inside the loop over user entries:

```ts
for (const [name, override] of Object.entries(user ?? {})) {
  failIfLegacyModelKeys(name, override);

  if (override.disabled === true) {
    if (!Object.hasOwn(DEFAULT_MODEL_DEFINITIONS, name)) {
      fail(`models.definitions.${name}: \`disabled: true\` is only valid for shipped defaults (${Object.keys(DEFAULT_MODEL_DEFINITIONS).join(", ")}). Remove the entry instead.`);
    }
    delete merged[name];
    continue;
  }

  // …existing per-key spread for cmd/color/usage
}
```

The `delete` is safe because `merged` was constructed fresh from `DEFAULT_MODEL_DEFINITIONS` in the lines immediately above. The function continues to return `Record<string, ModelDefinition>` with no new optional fields.

### 4. Default-vs-disabled check — `validate()` (config.ts:602+)

Just before the existing default-not-in-definitions check at `config.ts:661`:

```ts
const disabledNames = collectDisabledNames(userModels); // computed once in applyDefaults, passed in
if (disabledNames.has(config.models.default)) {
  fail(`models.default ("${config.models.default}") is disabled. Either re-enable it or set models.default to an enabled model.`);
}
```

Two reasonable plumbings:

- **(a)** Compute the disabled set in `applyDefaults` and thread it through to `validate`. Explicit, no hidden state.
- **(b)** Re-derive at validate time by diffing the merged definitions against `DEFAULT_MODEL_DEFINITIONS`: any shipped default not present in `merged` was disabled (since the only way a shipped default leaves the merge is via the disable path). Less plumbing but reads as "magic" until you know the invariant.

Recommendation: (a). The cost is one extra parameter and the relationship is self-documenting.

### 5. Documentation

- Add a brief subsection under the existing "Models" guidance in the groundcrew README (or wherever shipped models are documented) showing the `disabled: true` snippet and noting the CI-gating motivation.
- Update the "Gotchas" entry in the README from PR #663 to reference the new knob.

## Test plan

All tests live in existing `*.test.ts` files in `packages/groundcrew/src/`.

### `lib/config.test.ts` — primary test surface

1. **Happy path: disabled codex**
   - Given a config with `{ codex: { disabled: true } }` and `models.default: "claude"`,
   - Resolved `definitions` contains only `claude`,
   - `definitions.codex` is `undefined`.

2. **Combined-fields error**
   - `{ codex: { disabled: true, cmd: "x" } }` throws with the case-1 message.

3. **Typo-guard error**
   - `{ codexx: { disabled: true } }` throws with the case-2 message; the error includes the shipped-default list.

4. **Default-points-at-disabled error**
   - `models.default: "codex"` + `codex: { disabled: true }` throws case-3's message.
   - Assert specifically on the "is disabled" wording, not the generic "is not a key" wording — proves the new check runs first.

5. **`disabled: false` is rejected by the shape rule**
   - `{ codex: { disabled: false } }` throws the shape error. Confirms `disabled` is strictly `true`-or-absent and not a tri-state.

6. **`disabled` with non-boolean (e.g., `"true"`, `0`)**
   - Throws with the shape error.

### `commands/doctor.test.ts`

1. **Disabled model is not probed**
   - With codex disabled, `gatherToolTokens()` does not yield the codex executable token, and the doctor run does not call `which("codex")`.

### `lib/boardSource.test.ts`

1. **`agent-codex` label falls back to `models.default` when codex is disabled**
   - Confirms the "behaves like not-declared" claim — the existing fallback at `boardSource.ts:411` handles it without change.

### Out-of-scope but worth a smoke check

- `eligibility.test.ts`: the candidate filter already excludes anything not in `Object.keys(definitions)`, so no new test is strictly required. A one-line assertion that a disabled model is not a candidate would be cheap insurance.
- `setupWorkspace.test.ts`: same story — the existing missing-model path handles `definitions[model] === undefined`. No new test required.

## Risks and rollout

- **Risk: filter-at-merge means downstream consumers cannot distinguish "user disabled" from "user never declared".** This is intentional but worth noting in a code comment near the `delete` so the next reader doesn't try to "improve" it by preserving the disabled state. Effect on users: an `agent-codex` ticket falls back to `models.default` either way; the failure mode is identical and the diagnostic for unknown labels (if any) is preserved.
- **Risk: README drift.** The "Gotchas" entry in PR #663 will become outdated when this PR ships. Update it as part of the same PR to avoid divergence.
- **No migration needed.** Configs without `disabled` keys are unchanged.

## Suggested implementation order

1. Add the type extension and `failIfLegacyModelKeys` updates with their unit tests. (Red → green.)
2. Add the merge-time filter with its happy-path test.
3. Add the `models.default` disabled-check with its test.
4. Add the doctor and boardSource downstream-behavior tests.
5. Update README.

Each step is independently green-able; the PR ships as a single commit or a small commit chain per the project's "small & focused" rule.
