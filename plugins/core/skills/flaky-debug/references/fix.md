# Apply a Flaky Test Fix

Apply phase of the flaky-debug skill. Takes a plan produced by the planning phase ([`plan-e2e.md`](./plan-e2e.md) or [`plan-fast-path.md`](./plan-fast-path.md), finished by [`plan.md`](./plan.md)) and applies it.

## Preflight

Confirm the plan from `plan.md` has confidence ≥ 3. If confidence is 1-2, do not apply -- return to `plan.md` and gather more evidence first.

Before editing, verify the plan is still current:

- The failing commit's code path still exists on current `main`, or the plan has been adjusted for the current code.
- The proposed fix targets the diagnosed failure surface, not only the final assertion.
- Any retry/wait change is safe and idempotent; it must not repeat one-time credentials, duplicate writes, or destructive actions.
- The retry predicate names the exact transient failure signatures it matches: opaque 5xx yes; 4xx validation no; 429 only with a cap.
- The retry has a finite attempt or total-call bound, and exhaustion reports the attempts plus the last stdout/stderr/status/body.
- A retry against a rate-limited or quota-limited dependency such as Cognito, a 429-emitting API, token minting, one-time credential provisioning, or seed creation states its concurrency cap or call-volume bound. Without one, return to the plan and choose A7-style serialization or caching to de-stress the dependency. An uncapped retry is retry amplification and will be rejected under B1; a cap does not make a non-idempotent operation safe.

## Validate the Sibling Frontend Check

During Phase 2, after the proposed fix is designed and before the plan is finalized, use this recipe to complete the plan's **Sibling-repo check** when the current repository is `cbh-admin-frontend` or `cbh-mobile-app`. During the fix preflight, consume that result by confirming that the recorded sibling `main` commit is still current; rerun the search only when it changed or the plan omitted the field.

For a mechanism plausibly shared between `cbh-admin-frontend` and `cbh-mobile-app`, state the sibling repository, current `main` commit searched, exact helper names or grep-able code patterns, commands and scope, and matches found (or `None found`). A mechanism is plausibly shared when the proposed fix touches the test harness, authentication/session/bootstrap, cache, API client, or a copied capability, helper, or convention. If the same mechanism is present, state that the fix deliverable will include a linked mirror implementation ticket following the Groundcrew ticket conventions, linked to the source implementation ticket and referencing the landed source fix as the pattern to adopt. If the mechanism is not plausibly shared, state `N/A` and why.

Use this search recipe:

1. Map `cbh-admin-frontend` to `cbh-mobile-app`, and `cbh-mobile-app` to `cbh-admin-frontend`.
2. Search a temporary shallow clone pinned to the sibling repository's `main`:

   ```bash
   sibling_repo="<cbh-admin-frontend-or-cbh-mobile-app>"
   sibling_root="$(mktemp -d)/$sibling_repo"
   gh repo clone "ClipboardHealth/$sibling_repo" "$sibling_root" -- \
     --depth=1 --branch main --single-branch
   git -C "$sibling_root" rev-parse HEAD
   ```

3. Search for both the exact helper or capability names and the grep-able structural pattern behind the fix. Limit the first pass to likely harness and test paths, then widen to the repository if needed:

   ```bash
   rg -n --glob '*.{ts,tsx}' \
     '<exact-helper-name>|<grep-able-structural-pattern>' \
     "$sibling_root/<likely-path>"
   # Run only when the scoped search cannot rule the mechanism in or out.
   rg -n --glob '*.{ts,tsx}' \
     '<exact-helper-name>|<grep-able-structural-pattern>' \
     "$sibling_root"
   ```

4. Inspect each match to decide whether it carries the same mechanism, rather than relying on the text match alone. Record each query run, its scope, and the matching files or `None found` in the plan before applying the fix.

Do not edit the sibling repository as part of the current fix. When the same mechanism is present, the deliverable includes a linked mirror implementation ticket created after the source fix lands. Follow the `create-groundcrew-ticket` conventions: include the exact `Repository: <sibling-repo>` line in the description, assign the current Linear user, use Todo with exactly one appropriate `agent-*` label, link the source implementation ticket, and cite the landed PR or commit as the pattern to adopt. If the current workflow stops before merge, carry this as an explicit post-merge deliverable and do not report sibling-repo propagation as complete until the ticket exists.

## Apply the Proposed Fix

Edit the files listed in the plan's **Proposed fix** field. Keep the change minimal -- the plan already chose between test harness, product, and both.

Do not convert an infrastructure, backend, auth/data, or product-state root cause into a frontend timeout or locator retry. If the plan's evidence no longer supports the proposed fix, stop and revise the plan.

## Fix Sibling Instances

After fixing the root cause, search for other tests that exhibit the same anti-pattern. Flaky patterns often have siblings nearby, but do not turn a one-test plan into broad repo churn.

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

3. Apply the same fix to each sibling named in the plan or directly confirmed as the same root cause. Keep changes minimal; fix the anti-pattern, nothing else. Report broader candidates instead of editing them unless they clearly share the root cause.

4. List the sibling files you fixed in the output so reviewers can verify them.

## Verification

Run the plan's **Validation plan** commands — including the previously-flaky test, repeated enough times to give reasonable confidence the flake is gone. Lint and type-check touched files as the floor; do not stop there.

## Required Knowledge-Base Close-Out After Merge

After the target fix merges, close out the root-cause knowledge base in `references/root-cause-kb/`. This is required even when the plan matched an existing entry. A merged fix is new evidence about the mechanism and must not remain only in a target-repository PR.

1. In a core-utils checkout, reopen the plan's **KB match** and the [KB symptom index](./root-cause-kb/README.md). Read the matched entry, or identify the proposed entry path when the plan established a novel mechanism.
2. Print a dry-run statement before editing:

   ```text
   KB close-out dry run
   Entry: <existing path or proposed new path>
   Symptom signature: <signature being added or confirmed>
   Mechanism: <causal mechanism>
   Update type: <new evidence | new repository/surface | failed fix | new entry>
   Sections: <entry sections and index rows to change>
   Evidence: <merged PR, ticket, recurrence, trace, or fault-injection links>
   ```

3. Update the existing entry when the causal mechanism is the same:
   - Add or refine symptom signatures only when the new evidence makes them more discriminating.
   - Add a newly implicated repository or surface.
   - Add the merged fix and its validation under **What fixed it** and **Evidence**.
   - Add a failed or partial fix under **What failed and why**, including the recurrence evidence that falsified it.
   - Refresh **Current status** and `Last reviewed`.
4. Add a new entry only when the causal terminus proves a genuinely novel mechanism. Use the seven required sections from the KB index, index it by symptom signature and mechanism cue, and link evidence. A new test name, repository, or failure site is not by itself a new mechanism.
5. Run the core-utils sync and verification commands, open a focused core-utils PR for the KB change, and link that PR from the flaky implementation ticket or target fix PR. The close-out is not complete until the KB PR link is recorded.

Use the same statement discipline as the diagnosis plan. The final close-out must state:

```text
Knowledge-base close-out: <entry link>
Update: <new evidence | new repository/surface | failed fix | new entry>
Mechanism: <mechanism>
Evidence: <merged fix and recurrence/validation links>
KB PR: <link>
```

If the target fix has not merged, write `Knowledge-base close-out: pending — <target PR> is not merged` and leave the close-out open. Do not use `no KB update needed`. The checked-in [workplace-review sheet dry run](./root-cause-kb/dry-run-workplace-review-sheet.md) demonstrates the lookup, cited plan, and post-merge entry update without external writes.

## Output Format

When opening a PR for a flaky test fix, include `--label flaky-test-fix` in the `gh pr create` command so other agents can find it during Phase 1b deduplication.

When documenting the fix in a PR or issue, use this structure. Carry **Confidence**, **Symptom**, **Root cause**, **Evidence**, **Sibling-repo check**, and **Residual risk** straight over from the plan. Three plan fields rename: **Proposed fix** → **Fix**, **Sibling candidates** → **Siblings fixed**, **Validation plan** → **Validation**. Add the linked mirror ticket URL to **Sibling-repo check** once the source fix lands and the ticket exists. Before then, record `Pending: create linked mirror implementation ticket after <source-PR> lands`; replace that status with the ticket URL when created. Drop **Open questions** (resolved by fix time):

- **Test ID:** if provided in prompt
- **Agent session ID:** your running session ID to resume if needed
- **Confidence:** score (1-5) with brief justification
- **Failure surface:** where the failure first surfaced and why the fix belongs there
- **Current main status:** whether the failure path still existed when the fix was made
- **KB match:** the cited entry, matched symptom signature, mechanism hypothesis, and failed fixes to avoid; or `None` plus the fingerprints and symptom signatures checked against the index
- **Symptom:** what failed and where
- **Root cause:** concise technical explanation
- **Evidence:** artifacts supporting the diagnosis (traces, network, error messages, screenshots as applicable)
- **Fix:** test-only, product-only, or both
- **Siblings fixed:** list of other files where the same anti-pattern was or should be corrected (or "N/A -- fix was test-specific")
- **Sibling-repo check:** sibling repository and current `main` commit searched; exact helper names or grep-able code patterns; commands, scope, and matches; linked mirror implementation ticket URL when created, or the explicit pending post-merge deliverable before then; or `N/A` with the reason the mechanism was not plausibly shared
- **Validation:** commands and suites run
- **Residual risk:** what could still be flaky
- **Knowledge-base close-out:** the entry update and KB PR link after merge, or the explicit pending statement before merge
