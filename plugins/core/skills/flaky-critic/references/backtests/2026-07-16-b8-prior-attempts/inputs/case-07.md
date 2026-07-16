# Historical plan snapshot

## Groundcrew

Repository: `[admin frontend]`
Implementation workflow: use the `core:go` skill.

## Task

Fix the My Account Change Password Playwright flake by preventing or clearly diagnosing staging frontend deploy drift for source-coupled E2E runs.

The current failure is not the prior [ticket redacted]/[ticket redacted] `firebaseId` response-schema issue. In this run, `/my-account` rendered successfully with the authenticated app shell, but the page snapshot showed only the `Edit` action in Personal Information. The expected `Change password` button was absent even though commit `673813bc6603911dcd8bb3dff83edbd96585c5a8` bakes the Change Password action on unconditionally.

## Flake Details

```json
{
  "repo": "[admin frontend]",
  "test": "My Account (redesign) — desktop user changes password from the Change Password dialog and sees the success toast",
  "file": "playwright/e2e/myAccount.spec.ts:88",
  "framework": "playwright",
  "isNewFlaky": false,
  "failures": [
    {
      "error": "TimeoutError: locator.click: Timeout 30000ms exceeded.\nCall log:\n  - waiting for getByRole('button', { name: 'Change password' })\n",
      "stack": "TimeoutError: locator.click: Timeout 30000ms exceeded.\nCall log:\n  - waiting for getByRole('button', { name: 'Change password' })\n\n    at /opt/actions-runner/_work/[admin frontend]/[admin frontend]/playwright/e2e/myAccount.spec.ts:99:67\n    at WorkerMain._runTest (/opt/actions-runner/_work/[admin frontend]/[admin frontend]/node_modules/dd-trace/packages/datadog-instrumentations/src/playwright.js:1692:5)",
      "branch": "main",
      "pipeline": "[external evidence reference]",
      "commit": "673813bc6603911dcd8bb3dff83edbd96585c5a8",
      "durationMs": 50682,
      "shard": "3/4",
      "timestamp": "2026-06-04T14:55:30Z"
    },
    {
      "error": "TimeoutError: locator.click: Timeout 30000ms exceeded.\nCall log:\n  - waiting for getByRole('button', { name: 'Change password' })\n",
      "stack": "TimeoutError: locator.click: Timeout 30000ms exceeded.\nCall log:\n  - waiting for getByRole('button', { name: 'Change password' })\n\n    at /opt/actions-runner/_work/[admin frontend]/[admin frontend]/playwright/e2e/myAccount.spec.ts:99:67\n    at WorkerMain._runTest (/opt/actions-runner/_work/[admin frontend]/[admin frontend]/node_modules/dd-trace/packages/datadog-instrumentations/src/playwright.js:1692:5)",
      "branch": "main",
      "pipeline": "[external evidence reference]",
      "commit": "673813bc6603911dcd8bb3dff83edbd96585c5a8",
      "durationMs": 52505,
      "shard": "3/4",
      "timestamp": "2026-06-04T14:54:36Z"
    },
    {
      "error": "TimeoutError: locator.click: Timeout 30000ms exceeded.\nCall log:\n  - waiting for getByRole('button', { name: 'Change password' })\n",
      "stack": "TimeoutError: locator.click: Timeout 30000ms exceeded.\nCall log:\n  - waiting for getByRole('button', { name: 'Change password' })\n\n    at /opt/actions-runner/_work/[admin frontend]/[admin frontend]/playwright/e2e/myAccount.spec.ts:99:67\n    at WorkerMain._runTest (/opt/actions-runner/_work/[admin frontend]/[admin frontend]/node_modules/dd-trace/packages/datadog-instrumentations/src/playwright.js:1692:5)",
      "branch": "main",
      "pipeline": "[external evidence reference]",
      "commit": "673813bc6603911dcd8bb3dff83edbd96585c5a8",
      "durationMs": 54791,
      "shard": "3/4",
      "timestamp": "2026-06-04T14:53:40Z"
    }
  ]
}
```

## Investigation Plan Output

**Test ID:** `09855dc59185`; LLM report test id `eafff14ebc7fdc0b7350-40c6230c6fa0783ea922`

**Confidence:** 4/5. The artifacts directly show the button absent while the page is otherwise rendered. The one inferred link is the exact deployed frontend build/version because the workflow did not assert or record the expected deployed commit for this manual staging run.

**Failure surface:** CI/workflow setup plus assertion/locator symptom. The user action never starts because the target UI element is absent before the click.

**Current main status:** The failing commit is current `main` in this worktree and the source code still includes the Change Password action. Commit `673813bc6603911dcd8bb3dff83edbd96585c5a8` specifically removed the `isChangePasswordEnabled` flag gate and made the button unconditional. No open change labeled `flaky-test-fix` matched `myAccount.spec.ts` or this test.

**Symptom:** `page.getByRole("button", { name: "Change password" }).click()` timed out for 30 seconds at `playwright/e2e/myAccount.spec.ts:99` on all three attempts.

**Root cause:** The staging E2E workflow was run with `workflow_dispatch` and no `expected_deployed_commit_sha`, so `.github/actions/playwright-tests` skipped the existing `playwright:assert-deployed-commit` guard. The test checked out commit `673813bc6603911dcd8bb3dff83edbd96585c5a8`, whose source expects `Change password` to always render, while the browser exercised `[external evidence reference] without verifying that staging served that same commit. The failure artifact matches an older or divergent frontend contract where the Change Password action is still hidden/gated: My Account rendered with `Edit`, account details, notification preferences, and no `Change password` button.

**Evidence:**

- GitHub run: `[external evidence reference]
- Job env in failed shard included `E2E_TARGET_ENVIRONMENT=staging`, `E2E_CHECKOUT_REF=673813bc6603911dcd8bb3dff83edbd96585c5a8`, and blank `EXPECTED_DEPLOYED_COMMIT_SHA` / `DEPLOYED_FRONTEND_BUILD_DIR`.
- Workflow code already has a deploy assertion path, but `.github/actions/playwright-tests/action.yml` only runs `node --run playwright:assert-deployed-commit` when both `E2E_TARGET_ENVIRONMENT` and `EXPECTED_DEPLOYED_COMMIT_SHA` are present.
- LLM report: one failed test, all three attempts failed with the same missing locator.
- Timeline: Cognito password login succeeded (`POST [external evidence reference] returned 200); `/api/facilityUser/findByEmail`returned 200;`/my-account` document returned 200; the click then waited 30 seconds for the missing button.
- Failure page snapshots showed authenticated My Account page content and `Personal Information` with only `button "Edit"`; `Change password` was absent in all three snapshots.
- Source at the failing commit shows `PersonalInfoSection` renders `Change password` unconditionally after removing the old `isChangePasswordEnabled` prop.
- Prior related [ticket redacted] was duplicate of [ticket redacted] and covered by [ticket redacted] for a different failure mode: My Account error state after `findByEmail` schema validation. That is not this occurrence because the page content loaded successfully.

**Proposed Fix:**

1. In `.github/workflows/e2e-tests-staging.yml` / `.github/actions/playwright-tests/action.yml`, make source-coupled staging E2E runs fail fast when they run against a remote frontend without an asserted deployed commit. For `workflow_dispatch`, either require `expected_deployed_commit_sha` for `playwright:run:critical-e2e` or default it to the checked-out SHA when the intent is to validate current `main`. Reuse the existing `playwright:assert-deployed-commit` path rather than adding a new polling mechanism.
2. Add a small, deterministic My Account page-ready helper or inline guard in `playwright/e2e/myAccount.spec.ts`: after `page.goto("/my-account")`, assert the heading, signed-in email, and `Personal Information` are visible before interacting with `Change password`. Then assert `Change password` is visible before clicking so a missing action fails as a contract/deploy mismatch instead of a 30s action timeout.
3. Add diagnostics for future occurrences: when the button is absent, record the app version/deployed commit if available, the current URL, and a compact account action snapshot. Prefer wiring this through a reusable Playwright helper rather than ad hoc sleeps/timeouts.

**Observability To Reach 5/5:**

- Add deployed frontend commit/app version to the Playwright LLM report environment or per-attempt metadata. The app already exposes `__APP_VERSION__` in source and has a Debug page; make this easy for E2E diagnostics to capture.
- Include `E2E_CHECKOUT_REF`, `EXPECTED_DEPLOYED_COMMIT_SHA`, `E2E_TARGET_ENVIRONMENT`, and the canonical remote frontend version in the LLM report or a test annotation for every remote E2E run.
- If remote E2E runs intentionally allow deployed-source drift, add an explicit annotation so flaky-test triage can distinguish product/test failures from stale deployment validation failures.

**Sibling Candidates:**

- Other source-coupled critical E2E tests run by `.github/workflows/e2e-tests-staging.yml` via `workflow_dispatch` with no `expected_deployed_commit_sha`.
- Other tests that navigate directly to a feature page and immediately click an element without first asserting a deterministic page-ready contract.

**Validation Plan:**

- `npm run lint:fast -- playwright/e2e/myAccount.spec.ts .github/actions/playwright-tests/action.yml .github/workflows/e2e-tests-staging.yml` if the repo command supports path args; otherwise run `npm run lint:fast`.
- `npm run typecheck`.
- For the test change, run the smallest relevant Playwright command against an environment with a pinned deployed commit: `E2E_TARGET_ENVIRONMENT=staging EXPECTED_DEPLOYED_COMMIT_SHA=<sha> npm run playwright:run:critical-e2e -- --project="Desktop Chrome" --grep "user changes password from the Change Password dialog"`.
- Also run `node --run playwright:assert-deployed-commit` with `E2E_TARGET_ENVIRONMENT=staging` and a known current deployed SHA to verify the fast-fail path.

**Open Questions:**

- Confirm whether Flaky Test Management manually dispatches `e2e-tests-staging.yml` without `expected_deployed_commit_sha`. If yes, update that dispatch path as part of the fix.
- Decide whether manual staging runs should require the input or default to the current deployed SHA. For flaky remediation, requiring/passing the expected SHA is safer.

**Residual Risk:**

- If staging legitimately rolls a different UI contract while tests are executing, pinned deploy checks prevent false source/test failures but cannot make a mismatched deployment pass.
- After deploy drift is removed, the password mutation itself can still fail due to Cognito throttling or account setup issues; those are separate surfaces and should have their own artifacts.

## Required change / Datadog Remediation Instructions

- Include both the investigation ticket ID (`[ticket redacted]`) and this implementation ticket ID in the change body.
  - `pup api -X POST v2/test/flaky-test-management/tests`
- Implement this plan using the `core:go` skill.

## Related Tickets

- Investigation: [ticket redacted]
- Prior related investigation: [ticket redacted]
- Prior same-area investigation found via comments: [ticket redacted]
- Prior implementation for different root cause: [ticket redacted]
