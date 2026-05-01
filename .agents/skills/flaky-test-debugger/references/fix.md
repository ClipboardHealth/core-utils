# Apply a Flaky Test Fix

Apply phase of the flaky-test-debugger skill. Takes a plan produced by [`plan.md`](./plan.md) and applies it.

## Preflight

Confirm the plan from `plan.md` has confidence ≥ 3. If confidence is 1-2, do not apply -- return to `plan.md` and gather more evidence first.

## Apply the Proposed Fix

Edit the files listed in the plan's **Proposed fix** field. Keep the change minimal -- the plan already chose between test harness, product, and both.

## Fix Sibling Instances

After fixing the root cause, search for other tests that exhibit the same anti-pattern and fix them too. A flaky pattern in one test file almost always has siblings nearby.

### When to search

Search for siblings when the root cause is a **structural anti-pattern** -- something that would be wrong regardless of the specific test logic:

- Missing or incomplete teardown (`afterAll`/`afterEach` not closing connections, not restoring mocks)
- Hardcoded ports instead of dynamic allocation
- Shared mutable state without per-test reset
- Missing `act()` wrappers or `waitFor` around async assertions
- Fake timers not restored in `afterEach`
- Stale data patterns (E2E: missing reload/re-fetch; service: no DB cleanup between tests)

### When NOT to search

Skip this step when the fix is **specific to one test's logic** -- for example a test-specific race condition in a unique setup or a one-off typo.

### How to search

1. Identify the anti-pattern as a grep-able code pattern. Examples:
   - Missing connection cleanup: grep for `createTestingModule` in test files and check each for proper `afterAll` teardown
   - Hardcoded port: grep for `listen(3000)` or `listen(PORT)` in test files
   - Missing mock restore: grep for `jest.spyOn` in files that lack `restoreAllMocks`
   - Missing `act()`: grep for `render(` in `.test.tsx` files that call state-changing functions without `act` or `waitFor`

2. Scope the search to the same area of the codebase first (same package or directory), then widen if the pattern is pervasive.

3. Apply the same fix to each sibling. Keep changes minimal; fix the anti-pattern, nothing else.

4. List the sibling files you fixed in the output so reviewers can verify them.

## Verification

Lint and type-check touched files.

## Output Format

When opening a PR for a flaky test fix, include `--label flaky-test-fix` in the `gh pr create` command so other agents can find it during Phase 1b deduplication.

When documenting the fix in a PR or issue, use this structure. Carry **Confidence**, **Symptom**, **Root cause**, **Evidence**, and **Residual risk** straight over from the plan. Three plan fields rename: **Proposed fix** → **Fix**, **Sibling candidates** → **Siblings fixed**, **Validation plan** → **Validation**. Drop **Open questions** (resolved by fix time):

- **Test ID:** if provided in prompt
- **Agent session ID:** your running session ID to resume if needed
- **Confidence:** score (1-5) with brief justification
- **Symptom:** what failed and where
- **Root cause:** concise technical explanation
- **Evidence:** artifacts supporting the diagnosis (traces, network, error messages, screenshots as applicable)
- **Fix:** test-only, product-only, or both
- **Siblings fixed:** list of other files where the same anti-pattern was or should be corrected (or "N/A -- fix was test-specific")
- **Validation:** commands and suites run
- **Residual risk:** what could still be flaky
