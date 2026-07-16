# Historical plan snapshot

## Groundcrew

Repository: [admin frontend]
Implementation workflow: use the `cb-work` skill when available. If that skill is unavailable, use the `core:go`/`go` skill. Include this implementation ticket ID in the change body.

```bash

```

## Task

Fix the shared workplace magic-link Playwright sign-in harness so successful but slow auth completion does not cause `retryUntilPassOrTimeout` to retry on the same page and then wait for the login Email field after the session is already authenticated.

## Acceptance Criteria

- [ ] `signInAsWorkplaceUser` no longer times out filling `getByLabel("Email")` when a previous magic-link attempt completes auth after the redirect wait budget.
- [ ] The helper still retries promptly when the magic link is expired/already used or the auth error screen is visible.
- [ ] The fix is applied to sibling workplace magic-link/OTP retry paths that navigate to `/login` and fill Email inside `retryUntilPassOrTimeout`.
- [ ] The change body includes this implementation ticket ID.

## Flake Details

```json
{
  "repo": "[admin frontend]",
  "test": "Reporting (redesign) — desktop page chrome and all four KPI cards render on landing",
  "file": "playwright/e2e/reporting.spec.ts:15",
  "framework": "playwright",
  "isNewFlaky": true,
  "failures": [
    {
      "error": "Error: locator.fill: Timeout 30000ms exceeded.\nCall log:\n  - waiting for getByLabel('Email')\n\n\nCall Log:\n- Timeout 90000ms exceeded while waiting on the predicate",
      "stack": "Error: locator.fill: Timeout 30000ms exceeded.\nCall log:\n  - waiting for getByLabel('Email')\n\n\nCall Log:\n- Timeout 90000ms exceeded while waiting on the predicate\n    at retryUntilPassOrTimeout (/opt/actions-runner/_work/[admin frontend]/[admin frontend]/playwright/helpers/common.ts:6:26)\n    at signInAsWorkplaceUser (/opt/actions-runner/_work/[admin frontend]/[admin frontend]/playwright/helpers/scheduleSeed.ts:97:32)\n    at /opt/actions-runner/_work/[admin frontend]/[admin frontend]/playwright/e2e/reporting.spec.ts:20:7\n    at WorkerMain._runTest (/opt/actions-runner/_work/[admin frontend]/[admin frontend]/node_modules/dd-trace/packages/datadog-instrumentations/src/playwright.js:1692:5)",
      "branch": "main",
      "pipeline": "[external evidence reference]",
      "commit": "4804367a1bf5dc5f55e097868ac06decc8fc175c",
      "durationMs": [attempt reference redacted],
      "shard": "3/4",
      "timestamp": "2026-07-01T13:51:35Z"
    }
  ]
}
```

## Plan Output

**Test ID:** c5fb8ef2d524

**Confidence:** 5/5. The LLM report timeline, network events, and screenshot directly show the helper timing out a successful auth attempt, retrying, and then ending on the authenticated Schedule page while waiting for the login Email field.

**Failure surface:** test setup/auth/data. The reporting page was never reached in the failed attempt.

**Current main status:** the failing commit `4804367a1bf5dc5f55e097868ac06decc8fc175c` is still represented by current main/current branch. The shared `signInAsWorkplaceUser` path and `waitForWorkplaceMagicLinkSignIn` helper still exist. There is no open `flaky-test-fix` change for `reporting.spec.ts`, `scheduleSeed.ts`, or `workplaceSignIn.ts`. Prior commit `766c7575fbd` added the 15s bounded redirect wait, but this flake occurred after that change.

**Symptom:** `playwright/e2e/reporting.spec.ts:15` failed in `signInAsWorkplaceUser` before `gotoAppRoute({ url: "/facility/invoice/reporting" })`. The outer `retryUntilPassOrTimeout` expired after the retry callback hit `locator.fill` timeout waiting for `getByLabel('Email')`.

**Root cause:** `waitForWorkplaceMagicLinkSignIn` treats a workplace magic-link redirect that takes more than 15s as a failed attempt. In this run, the first magic-link Continue click was valid and Cognito returned success, but authenticated app bootstrap did not finish until roughly 20.7s after the click. The helper timed out at 15s, the retry loop navigated back to `/login` on the same page, and the late success from the first attempt established the session and redirected to `/schedule`. The retry then waited for an Email field on an authenticated Schedule page. Later retries repeated the same pattern because the page was already signed in.

**Evidence:**

- LLM report summary: 52 total tests, 1 flaky, 0 failed after retry. The flaky entry is exactly `Reporting (redesign) — desktop > page chrome and all four KPI cards render on landing`.
- Failed attempt timeline: first `/login` navigation at 12.106s, Email fill at 13.324s, magic-link page navigation at 17.336s, Continue click at 18.181s, then `Expect "toHaveURL"` failed after 15.003s.
- The same failed attempt retried at 34.231s with `Navigate to "/login"`, then `Fill "playwright-fmuepswefho@playwright-hcf.com" getByLabel('Email')` started at 38.854s and timed out after 30.012s.
- Authenticated workplace traffic began immediately after that retry fill started: `/api/facilityUser/findByEmail` returned 200 at 38.859s and `/api/user/get/...` returned 200 at 38.926s.
- The failure screenshot shows the authenticated Schedule page for `test facility mvsij0epxt`, not the login page.
- No reporting API/navigation/assertion ran in the failed attempt; the retry passed and reached `/facility/invoice/reporting` normally.

**Proposed fix:** test harness fix in `playwright/helpers/workplaceSignIn.ts` and the magic-link callers.

1. Replace the fixed 15s schedule URL wait with an outcome-based wait: allow a successful `/schedule` redirect for up to the same order as other Cognito login flows (the password helper uses 60s), while racing/polling for visible expired/already-used/auth-error text so bad links still fail promptly and request a fresh link.
2. Make retry attempts idempotent when a previous auth attempt finishes late. Before filling Email after `page.goto("/login")`, wait for either the login Email field or an authenticated schedule URL. If schedule is reached, return success instead of filling the form.
3. Apply the same already-authenticated/form-ready guard to sibling retry helpers that call `/login` and fill Email inside `retryUntilPassOrTimeout`, notably the local `submitMagicLinkForm` in `playwright/e2e/auth.spec.ts` and the email OTP request helper in `playwright/e2e/cognito/cognitoEmailOtpAuth.spec.ts` if it shares the same retry hazard.
4. Keep the diagnostics from `workplaceSignIn.ts`: sanitized current URL, visible auth error text, elapsed time since link request, schedule reached boolean, and magic-link marker.

**Observability to reach 5/5:** N/A -- confidence is 5/5 for the test-harness root cause. Optional improvement: add a structured stdout event when workplace magic-link sign-in times out or resolves as already authenticated after a retry, including elapsed time and sanitized URL, so future auth setup flakes can be grouped without opening the screenshot.

**Sibling candidates:** all specs using `signInAsWorkplaceUser` from `playwright/helpers/scheduleSeed.ts`; direct magic-link auth retries in `playwright/e2e/auth.spec.ts`; OTP retry flow in `playwright/e2e/cognito/cognitoEmailOtpAuth.spec.ts`.

**Validation plan:**

- `npm run lint:fast -- playwright/helpers/workplaceSignIn.ts playwright/helpers/scheduleSeed.ts playwright/e2e/auth.spec.ts playwright/e2e/cognito/cognitoEmailOtpAuth.spec.ts`
- `npx oxfmt --check playwright/helpers/workplaceSignIn.ts playwright/helpers/scheduleSeed.ts playwright/e2e/auth.spec.ts playwright/e2e/cognito/cognitoEmailOtpAuth.spec.ts`
- `npx cspell --no-must-find-files playwright/helpers/workplaceSignIn.ts playwright/helpers/scheduleSeed.ts playwright/e2e/auth.spec.ts playwright/e2e/cognito/cognitoEmailOtpAuth.spec.ts`
- `npm run typecheck`
- With staging E2E credentials available: `npx playwright test playwright/e2e/reporting.spec.ts --project="Desktop Chrome" --grep "page chrome and all four KPI cards render on landing"`
- Prefer also running the desktop auth magic-link test if credentials are available: `npx playwright test playwright/e2e/auth.spec.ts --project="Desktop Chrome" --grep "clicking the emailed verification link signs the user in"`

**Open questions:** none blocking. Use the smallest harness change that preserves fast retry for explicit auth errors while preventing a slow success from poisoning same-page retries.

**Residual risk:** this fixes the retry/idempotency race. It does not explain why successful Cognito workplace magic-link completion sometimes takes more than 15s in staging CI; if that latency grows past the new success window, the helper should fail with diagnostics rather than a misleading Email locator timeout.

## Investigation Notes

- The repository did not contain `scripts/fetch-llm-report.sh`, so the LLM report was downloaded with `gh run download 28522523810 --name playwright-llm-report`.
- Artifact path used for investigation: `/tmp/playwright-llm-report-28522523810/llm-report.json`.
- Failure screenshot decoded locally to `/tmp/reporting-flake-attempt0.png`; it showed the authenticated Schedule page.
