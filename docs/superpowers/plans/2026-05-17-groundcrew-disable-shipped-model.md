# Groundcrew — Disable a shipped default model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-model `disabled: true` knob to `models.definitions` that removes a shipped default from the resolved config, so `crew doctor` stops probing for the disabled model's CLI.

**Architecture:** Filter at the merge boundary (`mergeDefinitions` in `packages/groundcrew/src/lib/config.ts`). Disabled entries are stripped from the resolved `Record<string, ModelDefinition>`, so every downstream consumer (`doctor`, `eligibility`, `boardSource`, `setupWorkspace`, `usage`) becomes correct without any consumer-side code change. Three loud-failure validation cases: `disabled` combined with `cmd`/`color`/`usage`, `disabled` on a non-shipped key, and `models.default` pointing at a disabled model.

**Tech Stack:** TypeScript, Node, Vitest, nx (workspace runner), oxlint, oxfmt.

**Spec:** `docs/superpowers/specs/2026-05-17-groundcrew-disable-shipped-model-design.md`

---

## File Structure

All production code in one file, tests in three:

- **Modify:** `packages/groundcrew/src/lib/config.ts`
  - Add `disabled?: boolean` to `UserModelDefinition` (line 77).
  - Extend `failIfLegacyModelKeys` (line 464) with shape rule + combined-fields rule.
  - Extend `mergeDefinitions` (line 483) with filter logic + typo guard.
  - Extend `applyDefaults` (line 544) with the default-points-at-disabled check.

- **Modify:** `packages/groundcrew/src/lib/config.test.ts` — primary test surface (Tasks 1–3).

- **Modify:** `packages/groundcrew/src/commands/doctor.test.ts` — regression-guard test that disabled models aren't probed (Task 4).

- **Modify:** `packages/groundcrew/src/lib/boardSource.test.ts` — regression-guard test that `agent-codex` labels fall back to `models.default` when codex is disabled (Task 4).

- **Modify:** `packages/groundcrew/README.md` — add a `disabled` snippet under the existing Models guidance and update the Gotchas section (Task 5).

---

## Conventions used by this codebase

- **Test runner.** Vitest via nx. Per-file: `node --run -- nx test groundcrew -- src/lib/config.test.ts`. By name filter: append `-t "<test name fragment>"`. (If `nx` isn't on PATH, `npx nx test groundcrew -- …` also works.)
- **Test fixture style for `config.test.ts`.** Tests write a temp `config.ts` file via the `writeConfigFile()` + `configSource()` / hand-written-string helpers already in the file, point `GROUNDCREW_CONFIG` at it via `setEnvironmentVariable`, then call `loadFreshConfig()` → `loadConfig()`. Reuse `VALID_LINEAR`, `VALID_WORKSPACE(temporary)`.
- **Test naming.** Existing tests use phrases like `"rejects legacy …"`, `"merges per-key overrides …"`. Match that voice.
- **Error matching.** Existing tests use `await expect(loadConfig()).rejects.toThrow(/regex/)`. Escape regex metacharacters when matching backticks or parens.

---

## Task 1: Input shape validation — `disabled` field type, shape rule, combined-fields rule

**Files:**

- Modify: `packages/groundcrew/src/lib/config.ts:77` (the `UserModelDefinition` type)
- Modify: `packages/groundcrew/src/lib/config.ts:464-481` (`failIfLegacyModelKeys`)
- Modify: `packages/groundcrew/src/lib/config.test.ts` (append new `it` blocks alongside the existing legacy-rejection tests around line 423)

### Step 1.1: Write the first failing test (shape rule: `disabled: false`)

Append this test to `packages/groundcrew/src/lib/config.test.ts` immediately after the existing `"rejects legacy per-model sandbox config"` test (around line 459):

```ts
it("rejects `disabled: false` on a model definition", async () => {
  const path = writeConfigFile(temporary, ["export const config = {", `  linear: ${JSON.stringify(VALID_LINEAR)},`, `  workspace: ${JSON.stringify(VALID_WORKSPACE(temporary))},`, "  models: { definitions: { codex: { disabled: false } } },", "};"].join("\n"));
  setEnvironmentVariable("GROUNDCREW_CONFIG", path);

  const { loadConfig } = await loadFreshConfig();

  await expect(loadConfig()).rejects.toThrow(/models\.definitions\.codex\.disabled must be exactly `true` when set/);
});
```

- [ ] **Step 1.2: Run the test, confirm it fails**

```bash
node --run -- nx test groundcrew -- src/lib/config.test.ts -t "rejects \`disabled: false\`"
```

Expected: FAIL. The error path doesn't yet exist; either the test config will load successfully or a different error will fire.

- [ ] **Step 1.3: Extend the `UserModelDefinition` type**

Change `packages/groundcrew/src/lib/config.ts:77` from:

```ts
type UserModelDefinition = Partial<ModelDefinition>;
```

to:

```ts
type UserModelDefinition = Partial<ModelDefinition> & { disabled?: boolean };
```

- [ ] **Step 1.4: Extend `failIfLegacyModelKeys` with the shape rule**

Replace `packages/groundcrew/src/lib/config.ts:464-481` (the entire `failIfLegacyModelKeys` function) with:

```ts
function failIfLegacyModelKeys(name: string, override: unknown): asserts override is UserModelDefinition {
  if (!isPlainObject(override)) {
    fail(`models.definitions.${name} must be an object`);
  }
  if (Object.hasOwn(override, "isolation")) {
    fail(`models.definitions.${name}.isolation is no longer supported: per-model isolation is no longer supported`);
  }
  if (Object.hasOwn(override, "sandbox")) {
    fail(`models.definitions.${name}.sandbox is no longer supported: Docker Sandboxes are no longer supported`);
  }
  if (Object.hasOwn(override, "disabled")) {
    if (override.disabled !== true) {
      fail(`models.definitions.${name}.disabled must be exactly \`true\` when set (got ${JSON.stringify(override.disabled)})`);
    }
    const conflicting = (["cmd", "color", "usage"] as const).filter((key) => Object.hasOwn(override, key));
    if (conflicting.length > 0) {
      fail(`models.definitions.${name}: cannot combine \`disabled: true\` with other fields (${conflicting.join(", ")}). Either disable the model or override its fields, not both.`);
    }
  }
}
```

- [ ] **Step 1.5: Run the failing test, confirm it now passes**

```bash
node --run -- nx test groundcrew -- src/lib/config.test.ts -t "rejects \`disabled: false\`"
```

Expected: PASS.

- [ ] **Step 1.6: Add a test for non-boolean `disabled` (e.g. `"true"` string)**

Append to `packages/groundcrew/src/lib/config.test.ts`:

```ts
it('rejects a non-boolean `disabled` value (e.g. the string "true")', async () => {
  const path = writeConfigFile(temporary, ["export const config = {", `  linear: ${JSON.stringify(VALID_LINEAR)},`, `  workspace: ${JSON.stringify(VALID_WORKSPACE(temporary))},`, '  models: { definitions: { codex: { disabled: "true" } } },', "};"].join("\n"));
  setEnvironmentVariable("GROUNDCREW_CONFIG", path);

  const { loadConfig } = await loadFreshConfig();

  await expect(loadConfig()).rejects.toThrow(/models\.definitions\.codex\.disabled must be exactly `true` when set/);
});
```

- [ ] **Step 1.7: Run, confirm it passes (same code path)**

```bash
node --run -- nx test groundcrew -- src/lib/config.test.ts -t "non-boolean"
```

Expected: PASS.

- [ ] **Step 1.8: Write a failing test for the combined-fields rule**

Append to `packages/groundcrew/src/lib/config.test.ts`:

```ts
it("rejects `disabled: true` combined with other fields (cmd / color / usage)", async () => {
  const path = writeConfigFile(temporary, ["export const config = {", `  linear: ${JSON.stringify(VALID_LINEAR)},`, `  workspace: ${JSON.stringify(VALID_WORKSPACE(temporary))},`, "  models: { definitions: { codex: { disabled: true, cmd: 'override' } } },", "};"].join("\n"));
  setEnvironmentVariable("GROUNDCREW_CONFIG", path);

  const { loadConfig } = await loadFreshConfig();

  await expect(loadConfig()).rejects.toThrow(/models\.definitions\.codex: cannot combine `disabled: true` with other fields \(cmd\)/);
});
```

- [ ] **Step 1.9: Run, confirm it passes (the combined-fields branch in Step 1.4 already covers this)**

```bash
node --run -- nx test groundcrew -- src/lib/config.test.ts -t "cannot combine"
```

Expected: PASS.

- [ ] **Step 1.10: Run the full config.test.ts suite to confirm nothing else broke**

```bash
node --run -- nx test groundcrew -- src/lib/config.test.ts
```

Expected: PASS (all original tests + 3 new ones).

- [ ] **Step 1.11: Commit**

```bash
git add packages/groundcrew/src/lib/config.ts packages/groundcrew/src/lib/config.test.ts
git commit -m "$(cat <<'EOF'
feat(groundcrew): add `disabled` field shape rules to model definitions

Adds the `disabled?: boolean` field to UserModelDefinition and extends
failIfLegacyModelKeys with two validation rules:

  1. `disabled`, when present, must be exactly `true` (not falsy, not
     truthy strings/numbers — strictly boolean true-or-absent).
  2. `disabled: true` cannot be combined with cmd/color/usage; the user
     must express one operation per entry.

Part of groundcrew #4B (disable-shipped-default-model). No behavior
change yet: the filter logic that removes disabled entries from the
resolved config lands in the next commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Merge-time filter — drop disabled entries + typo guard

**Files:**

- Modify: `packages/groundcrew/src/lib/config.ts:483-525` (`mergeDefinitions`)
- Modify: `packages/groundcrew/src/lib/config.test.ts` (append two more `it` blocks)

### Step 2.1: Write the happy-path failing test (codex disabled → absent from resolved)

Append to `packages/groundcrew/src/lib/config.test.ts`, near the existing `"merges per-key overrides"` test (around line 365):

```ts
it("drops a shipped default when `disabled: true` is set", async () => {
  const path = writeConfigFile(
    temporary,
    configSource({
      linear: { ...VALID_LINEAR },
      workspace: VALID_WORKSPACE(temporary),
      models: {
        definitions: {
          codex: { disabled: true },
        },
      },
    }),
  );
  setEnvironmentVariable("GROUNDCREW_CONFIG", path);

  const { loadConfig } = await loadFreshConfig();
  const actual = await loadConfig();

  expect(Object.keys(actual.models.definitions).toSorted()).toStrictEqual(["claude"]);
  expect(actual.models.definitions["codex"]).toBeUndefined();
  expect(actual.models.default).toBe("claude");
});
```

- [ ] **Step 2.2: Run, confirm failure**

```bash
node --run -- nx test groundcrew -- src/lib/config.test.ts -t "drops a shipped default"
```

Expected: FAIL. Either the keys still include `codex`, or validation throws because `disabled` is now accepted by the shape rule but the merge logic still calls `requireString(cmd, …)` against the empty `merged[name]` build.

- [ ] **Step 2.3: Implement the merge-time filter + typo guard**

Replace the user-entries loop inside `packages/groundcrew/src/lib/config.ts` `mergeDefinitions` (currently at lines 495-523) with:

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

  const base: Partial<ModelDefinition> = merged[name] === undefined ? {} : cloneModelDefinition(merged[name]);
  // Per-key spread so overriding `cmd` alone preserves the default
  // `color` / `usage`. Brand-new entries must supply both required fields.
  const candidate: Partial<ModelDefinition> = { ...base };
  if (override.cmd !== undefined) {
    candidate.cmd = override.cmd;
  }
  if (override.color !== undefined) {
    candidate.color = override.color;
  }
  if (override.usage !== undefined) {
    candidate.usage = override.usage;
  }
  const { cmd, color, usage } = candidate;
  if (typeof cmd !== "string" || cmd.length === 0) {
    fail(`models.definitions.${name}.cmd must be a non-empty string`);
  }
  if (typeof color !== "string" || color.length === 0) {
    fail(`models.definitions.${name}.color must be a non-empty string`);
  }
  const definition: ModelDefinition = { cmd, color };
  if (usage !== undefined) {
    definition.usage = usage;
  }
  merged[name] = definition;
}
```

The only change vs the original is the early `if (override.disabled === true)` block before the spread. The existing per-key spread is preserved verbatim.

- [ ] **Step 2.4: Run the happy-path test, confirm pass**

```bash
node --run -- nx test groundcrew -- src/lib/config.test.ts -t "drops a shipped default"
```

Expected: PASS.

- [ ] **Step 2.5: Write the typo-guard failing test**

Append to `packages/groundcrew/src/lib/config.test.ts`:

```ts
it("rejects `disabled: true` on a key that isn't a shipped default", async () => {
  const path = writeConfigFile(
    temporary,
    configSource({
      linear: { ...VALID_LINEAR },
      workspace: VALID_WORKSPACE(temporary),
      models: {
        // Typo of "codex" — guard catches this before the user is left wondering
        // why doctor still probes for the codex binary.
        definitions: {
          codexx: { disabled: true },
        },
      },
    }),
  );
  setEnvironmentVariable("GROUNDCREW_CONFIG", path);

  const { loadConfig } = await loadFreshConfig();

  await expect(loadConfig()).rejects.toThrow(/models\.definitions\.codexx: `disabled: true` is only valid for shipped defaults \(claude, codex\)\. Remove the entry instead\./);
});
```

- [ ] **Step 2.6: Run, confirm pass (the typo branch in Step 2.3 already covers this)**

```bash
node --run -- nx test groundcrew -- src/lib/config.test.ts -t "isn't a shipped default"
```

Expected: PASS.

- [ ] **Step 2.7: Run the full config.test.ts suite**

```bash
node --run -- nx test groundcrew -- src/lib/config.test.ts
```

Expected: PASS.

- [ ] **Step 2.8: Commit**

```bash
git add packages/groundcrew/src/lib/config.ts packages/groundcrew/src/lib/config.test.ts
git commit -m "$(cat <<'EOF'
feat(groundcrew): filter disabled models from resolved config + typo guard

`mergeDefinitions` now drops any entry with `disabled: true` from the
merged map, so downstream consumers (doctor, eligibility, boardSource,
setupWorkspace, usage) see the disabled model as if it were never
declared. Also adds a typo guard: `disabled: true` on a key that isn't
a shipped default (e.g. `codexx`) throws with a message listing the
valid shipped names.

Part of groundcrew #4B.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `models.default` points at a disabled model

**Files:**

- Modify: `packages/groundcrew/src/lib/config.ts:544-590` (`applyDefaults`)
- Modify: `packages/groundcrew/src/lib/config.test.ts` (append one `it` block)

### Step 3.1: Write the failing test

Append to `packages/groundcrew/src/lib/config.test.ts`:

```ts
it("rejects disabling the model used as `models.default`", async () => {
  const path = writeConfigFile(
    temporary,
    configSource({
      linear: { ...VALID_LINEAR },
      workspace: VALID_WORKSPACE(temporary),
      models: {
        default: "codex",
        definitions: {
          codex: { disabled: true },
        },
      },
    }),
  );
  setEnvironmentVariable("GROUNDCREW_CONFIG", path);

  const { loadConfig } = await loadFreshConfig();

  // Asserts on the specific "is disabled" wording, not the generic
  // "is not a key in models.definitions" wording — proves the
  // disabled-specific check runs before the existing default-validity check.
  await expect(loadConfig()).rejects.toThrow(/models\.default \("codex"\) is disabled\. Either re-enable it or set models\.default to an enabled model\./);
});
```

- [ ] **Step 3.2: Run, confirm it fails (or fails with the WRONG message)**

```bash
node --run -- nx test groundcrew -- src/lib/config.test.ts -t "rejects disabling the model used as"
```

Expected: FAIL. The existing `validate()` throws `models.default ("codex") is not a key in models.definitions (have: claude)` — the new test's regex won't match.

- [ ] **Step 3.3: Add the disabled-default check to `applyDefaults`**

Inside `applyDefaults`, just before the final `return {…}` (currently line 563), insert:

```ts
const mergedDefinitions = mergeDefinitions(user.models?.definitions);
const effectiveDefault = user.models?.default ?? "claude";
if (Object.hasOwn(DEFAULT_MODEL_DEFINITIONS, effectiveDefault) && !Object.hasOwn(mergedDefinitions, effectiveDefault)) {
  fail(`models.default ("${effectiveDefault}") is disabled. Either re-enable it or set models.default to an enabled model.`);
}
```

Then change the existing `models:` block in the returned object from:

```ts
    models: {
      default: user.models?.default ?? "claude",
      definitions: mergeDefinitions(user.models?.definitions),
    },
```

to use the names you just bound (so `mergeDefinitions` is invoked once, not twice):

```ts
    models: {
      default: effectiveDefault,
      definitions: mergedDefinitions,
    },
```

Why "shipped-default + missing-from-merged" is sufficient: the only way a shipped default disappears from `merged` is via the `disabled: true` path in `mergeDefinitions` (Task 2). Brand-new user-defined names can't trigger this check because `Object.hasOwn(DEFAULT_MODEL_DEFINITIONS, …)` is false for them; they continue to be handled by the existing default-not-in-definitions check at `config.ts:661-664`.

- [ ] **Step 3.4: Run, confirm pass**

```bash
node --run -- nx test groundcrew -- src/lib/config.test.ts -t "rejects disabling the model used as"
```

Expected: PASS.

- [ ] **Step 3.5: Run the full config.test.ts suite**

```bash
node --run -- nx test groundcrew -- src/lib/config.test.ts
```

Expected: PASS.

- [ ] **Step 3.6: Commit**

```bash
git add packages/groundcrew/src/lib/config.ts packages/groundcrew/src/lib/config.test.ts
git commit -m "$(cat <<'EOF'
feat(groundcrew): reject disabling the model used as models.default

Adds a disabled-specific error message when models.default points at a
model that was disabled via `disabled: true`. The existing validation at
config.ts:661 would otherwise fire with the misleading "is not a key in
models.definitions" message — the user did declare the entry; they just
disabled it.

Part of groundcrew #4B.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Downstream smoke tests — doctor + boardSource

**Why these tests exist:** With the filter-at-merge approach in Task 2, downstream consumers don't need code changes. These tests are regression guards that prove the claim — they pin the contract so a future refactor that re-introduces disabled entries into the resolved map will be caught.

**Files:**

- Modify: `packages/groundcrew/src/commands/doctor.test.ts` (append one `it` block inside the existing `describe(doctor, …)`)
- Modify: `packages/groundcrew/src/lib/boardSource.test.ts` (append one `it` block alongside the existing `"resolves the model from an agent-* label"` test)

### Step 4.1: Write the doctor regression test

Append to `packages/groundcrew/src/commands/doctor.test.ts`, inside `describe(doctor, …)`, anywhere a similar `it("…")` block fits (e.g. after the existing `"skips flag values when tokenizing model commands"` test around line 254):

```ts
it("does not probe a disabled model's CLI binary", async () => {
  // makeConfig's default fixture has only `claude` in definitions —
  // simulating the post-filter state of a config with codex disabled.
  loadConfigMock.mockResolvedValue(makeConfig());

  await doctor();

  expect(checkedCommands()).not.toContain("codex");
  expect(checkedCommands()).toContain("claude");
});
```

- [ ] **Step 4.2: Run, confirm pass**

```bash
node --run -- nx test groundcrew -- src/commands/doctor.test.ts -t "does not probe a disabled model"
```

Expected: PASS. This is verifying existing behavior (doctor only iterates `Object.values(definitions)`), so no implementation change is required — that's the point.

- [ ] **Step 4.3: Write the boardSource regression test**

Append to `packages/groundcrew/src/lib/boardSource.test.ts`, inside the same `describe` block as the existing `"resolves the model from an agent-* label"` test:

```ts
it("falls back to models.default when an agent-<model> label refers to a disabled model", async () => {
  // Simulate the post-filter state of a config with codex disabled —
  // codex is absent from definitions. An agent-codex label should fall
  // back to models.default (claude), the same way unknown labels do.
  const configWithoutCodex = makeConfig({
    models: {
      default: "claude",
      definitions: {
        claude: { cmd: "claude", color: "#fff" },
      },
    },
  });

  const { source } = makeBoardSource(
    makeClient({
      pages: [[issueNode({ labels: { nodes: [{ name: "agent-codex" }] } })]],
    }),
    configWithoutCodex,
  );
  const state = await source.fetch();
  const [first] = state.issues;
  expect(first?.model).toBe("claude");
  expect(first?.runner).toBe("local");
});
```

- [ ] **Step 4.4: Run, confirm pass**

```bash
node --run -- nx test groundcrew -- src/lib/boardSource.test.ts -t "falls back to models.default when an agent"
```

Expected: PASS (existing fallback at `boardSource.ts:411` handles unknown agent labels).

- [ ] **Step 4.5: Run both touched test files**

```bash
node --run -- nx test groundcrew -- src/commands/doctor.test.ts
node --run -- nx test groundcrew -- src/lib/boardSource.test.ts
```

Expected: PASS.

- [ ] **Step 4.6: Commit**

```bash
git add packages/groundcrew/src/commands/doctor.test.ts packages/groundcrew/src/lib/boardSource.test.ts
git commit -m "$(cat <<'EOF'
test(groundcrew): regression guards for disabled-model downstream behavior

Two regression tests pinning the contract introduced in #4B:

  1. doctor.test.ts — when a model is absent from the resolved
     definitions (the post-filter state for a disabled model), its CLI
     binary is not probed by doctor.
  2. boardSource.test.ts — an agent-<model> label on a ticket falls
     back to models.default when that model is absent (i.e. disabled).
     Confirms the existing unknown-label fallback at boardSource.ts:411
     handles the disabled case without special-casing.

Part of groundcrew #4B.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: README updates

**Files:**

- Modify: `packages/groundcrew/README.md` (Config reference section around line 114; Gotchas section around line 164)

### Step 5.1: Locate the Models guidance in `Config reference`

```bash
grep -n "^##\|definitions" packages/groundcrew/README.md | head -30
```

Find the heading that introduces `models.definitions` (or, if there is no dedicated subsection, the closest place under `## Config reference` where it makes sense to add one).

- [ ] **Step 5.2: Add a "Disabling a shipped default" subsection**

Under the existing models guidance in the `## Config reference` section of `packages/groundcrew/README.md`, add (adjust heading level to match the surrounding subsections):

````markdown
#### Disabling a shipped default

Groundcrew ships with `claude` and `codex` as default model definitions. If you only ever route work through one of them, disable the other so `crew doctor` stops probing for the unused CLI:

```ts
// config.ts
export const config = {
  // …
  models: {
    default: "claude",
    definitions: {
      codex: { disabled: true },
    },
  },
};
```

Rules:

- `disabled: true` is only valid for shipped defaults (`claude`, `codex`).
- It cannot be combined with `cmd`, `color`, or `usage` overrides in the same entry.
- `models.default` must point at an enabled model.
````

- [ ] **Step 5.3: Update the Gotchas entry from PR #663**

Find the existing Gotcha that discusses `crew doctor` checking both `claude` and `codex` (added in PR #663). Replace its "workaround" or "until-fixed" wording with a pointer to the new knob:

> **`crew doctor` checks every model in `models.definitions`.** If you only use one shipped model, disable the other with `models.definitions.<name>: { disabled: true }` — see the "Disabling a shipped default" subsection under "Config reference" above.

If the existing Gotcha is phrased differently, edit only the parts about the workaround / future fix. Don't move the entry.

- [ ] **Step 5.4: Run markdown lint**

```bash
node --run markdown:lint
```

Expected: PASS. If it complains about heading levels or list spacing, fix those inline (do not silence the rule).

- [ ] **Step 5.5: Commit**

```bash
git add packages/groundcrew/README.md
git commit -m "$(cat <<'EOF'
docs(groundcrew): document `disabled: true` for shipped model defaults

Adds a Config reference subsection showing the `disabled: true` snippet
for the common "I only use one shipped model" case, and updates the
Gotchas entry from PR #663 to point at the new knob.

Part of groundcrew #4B.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Final verification

**Files:** None (verification only).

- [ ] **Step 6.1: Run all groundcrew tests**

```bash
node --run -- nx test groundcrew
```

Expected: PASS (every existing test plus the 7 new ones from this plan).

- [ ] **Step 6.2: Run the pre-push verify pipeline**

```bash
node --run verify
```

Expected: PASS for `architecture:check`, `cpd`, `embed:check`, `format:check`, `knip`, `lint`, `markdown:lint`, `spell:check`, `syncpack:lint`. If `cspell` flags a new word (unlikely — we only added `disabled`, which is common), fix it by either: (a) rephrasing if it was unintentional, or (b) adding the word to `cspell.json` if it's intentional and globally valid.

- [ ] **Step 6.3: Hand-spot-check the resolved type narrative**

```bash
grep -n "definitions\[" packages/groundcrew/src/commands/setupWorkspace.ts packages/groundcrew/src/lib/usage.ts packages/groundcrew/src/commands/eligibility.ts
```

Confirm each access site already tolerates a missing key (e.g. uses optional chaining, defensive lookup, or `Object.hasOwn`). No code changes — this is a 30-second mental check that the spec's "filter-don't-flag means no consumer needs changes" claim holds in the current source. If any site directly indexes without an undefined-check, raise it before merging — that's a pre-existing brittleness that would have been latent without the disable feature.

- [ ] **Step 6.4: Inspect the commit chain**

```bash
git log --oneline main..HEAD
```

Expected: 5 commits in this order (each one self-contained):

1. `feat(groundcrew): add \`disabled\` field shape rules to model definitions`
2. `feat(groundcrew): filter disabled models from resolved config + typo guard`
3. `feat(groundcrew): reject disabling the model used as models.default`
4. `test(groundcrew): regression guards for disabled-model downstream behavior`
5. `docs(groundcrew): document \`disabled: true\` for shipped model defaults`

The spec commit from the brainstorming session is upstream of these (`docs(groundcrew): spec for disabling shipped default models`).

---

## Self-review checklist (run before declaring this plan finished)

- [ ] Spec coverage — each of the spec's three loud-failure cases is implemented (Tasks 1+2+3) and tested. The merge-time filter is implemented (Task 2) and the type extension is in place (Task 1).
- [ ] No placeholders — every step has either a concrete command, a concrete code block, or both.
- [ ] Type consistency — `UserModelDefinition`, `ModelDefinition`, `mergeDefinitions`, `DEFAULT_MODEL_DEFINITIONS`, `effectiveDefault`, `mergedDefinitions` are used consistently across tasks.
- [ ] Test command consistency — all `node --run -- nx test groundcrew -- …` invocations use the same shape; filter strings (`-t "…"`) match the test names they target.
- [ ] Implementation order respects dependencies — Task 2 depends on the type extension from Task 1 (the merge filter reads `override.disabled`); Task 3 depends on Task 2 (it asks whether a shipped default left the merged map); Task 4 depends on Tasks 1–3 having shipped (since the regression tests assume disabled-aware behavior).
