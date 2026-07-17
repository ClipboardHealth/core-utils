# Historical plan snapshot

## Groundcrew

Repository: [admin frontend]
Implementation workflow: use the `cb-work` skill. If that skill is unavailable, use the `core:go` skill.

## Task

Stabilize the shared Playwright worker setup path used by the license E2E test when a transient license-manager/auth response is surfaced as HTTP 401 during `worker_license_creation`.

Do not change the license UI assertions for this failure. The failing attempt never reached the browser flow; it failed in `Agent.createAgentWithRetry()` while provisioning the worker.

## Required change / Commit Notes

- Include this implementation ticket ID in the change body.

## Flake Details

```json
{
  "repo": "[admin frontend]",
  "test": "Licenses should be able to approve and reject license as admin and verify change license logs",
  "file": "playwright/e2e/licenses.spec.ts:15",
  "framework": "playwright",
  "isNewFlaky": false,
  "failures": [
    {
      "error": "Error: Failed to create agent after 2 attempts.\nDiagnostics: {\"historicalCorrelationKey\":\"[correlation redacted]\",\"correlationId\":\"[correlation redacted]\",\"githubRunId\":\"28306756185\",\"githubRunAttempt\":\"1\",\"githubJob\":\"e2e-tests-staging\",\"shardIndex\":\"2\",\"shardTotal\":\"4\",\"workerIndex\":\"1\",\"parallelIndex\":\"1\",\"pid\":57618,\"status\":401,\"responseShape\":{\"message\":\"string\",\"statusCode\":\"number\"},\"apiGatewayRequestId\":\"fpZk4jo8vHcEJOQ=\",\"sanitizedResponseMessage\":\"Unauthorized\",\"errorName\":\"AxiosError\",\"errorMessage\":\"Request failed with status code 401\",\"errorCode\":\"ERR_BAD_REQUEST\"}",
      "stack": "Error: Failed to create agent after 2 attempts.\nDiagnostics: {\"historicalCorrelationKey\":\"[correlation redacted]\",\"correlationId\":\"[correlation redacted]\",\"githubRunId\":\"28306756185\",\"githubRunAttempt\":\"1\",\"githubJob\":\"e2e-tests-staging\",\"shardIndex\":\"2\",\"shardTotal\":\"4\",\"workerIndex\":\"1\",\"parallelIndex\":\"1\",\"pid\":57618,\"status\":401,\"responseShape\":{\"message\":\"string\",\"statusCode\":\"number\"},\"apiGatewayRequestId\":\"fpZk4jo8vHcEJOQ=\",\"sanitizedResponseMessage\":\"Unauthorized\",\"errorName\":\"AxiosError\",\"errorMessage\":\"Request failed with status code 401\",\"errorCode\":\"ERR_BAD_REQUEST\"}\n    at /opt/actions-runner/_work/[admin frontend]/[admin frontend]/playwright/api/createAgent.ts:160:13\n    at /opt/actions-runner/_work/[admin frontend]/[admin frontend]/playwright/e2e/licenses.spec.ts:31:21\n    at WorkerMain._runTest (/opt/actions-runner/_work/[admin frontend]/[admin frontend]/node_modules/dd-trace/packages/datadog-instrumentations/src/playwright.js:1692:5)",
      "branch": "main",
      "pipeline": "[external evidence reference]",
      "commit": "94ea9f242c3211186e9613f743b137043eae003d",
      "durationMs": 21949,
      "shard": "2/4",
      "timestamp": "2026-06-28T00:49:44Z"
    }
  ]
}
```

## Plan Output

**Test ID:** `60d14b1d432fd603aa6b-59e4c2e48b8e7a355f7f` from the downloaded `playwright-llm-report` for run [reference redacted]`.

**Confidence:** 4/5. The CI artifacts directly show the setup step, status code, request ID, and retry behavior. The only inferred link is the exact backend/auth reason why license-manager returned 401 for a token that had just worked elsewhere.

**Failure surface:** Test setup/auth/data. The test failed before app navigation or any license UI action.

**Current main status:** The failing code path still exists on current `origin/main`. `playwright/api/createAgent.ts` still classifies this 401 as `non_retryable_agent_setup_failure`; no open `flaky-test-fix` change was found for `licenses.spec.ts`/`createAgent.ts`. Recent setup/auth fixes (`[ticket redacted]`, `[ticket redacted]`, `[ticket redacted]`) improve nearby setup paths but do not cover this exact license-manager 401 classification.

**Symptom:** `playwright/e2e/licenses.spec.ts:31` failed in `agentInstance.createAgentWithRetry()` with `Failed to create agent after 2 attempts`. The final error was an Axios 401 from `POST [external evidence reference] with API Gateway request id `fpZk4jo8vHcEJOQ=`.

**Root cause:** `Agent.createAgentWithRetry()` retries whole worker setup for known transient setup failures, but its local retry classifier treats a 401 from setup provisioning as non-retryable. In this run, the admin token was freshly minted and validated, HCP creation succeeded, worker token acquisition succeeded, and another admin-token setup call (`stripe_setup`) succeeded. The 401 was isolated to `worker_license_creation` on attempt 2 and the Playwright retry passed with the same test scenario, so the frontend setup helper is bailing on a transient backend/auth failure instead of letting the existing fresh-identity retry boundary recover.

**Evidence:**

- LLM report summary: 53 tests total, 49 passed, 2 flaky, 0 failed. The license test was flaky: attempt 1 failed after 21.9s, attempt 2 passed after 19.4s.
- Attempt 1 steps show only setup/fixtures and teardown; browser network summary has 0 retained requests, confirming no UI flow ran before failure.
- Job log for correlation `[correlation redacted]`:
  - `admin_token_acquisition` success at 00:49:04.
  - `admin_token_validation` success at 00:49:04.
  - attempt 1 `hcp_creation` failed with retryable 504 (`apiGatewayRequestId=fpZiYh88vHcEJeg=`), then the helper retried.
  - attempt 2 `hcp_creation` success, `hcp_auth_token_acquisition` success, and `contract_signing` success.
  - attempt 2 `worker_license_creation` failed after 5040ms with status 401, response `{"message":"Unauthorized","statusCode":401}`, `apiGatewayRequestId=fpZk4jo8vHcEJOQ=`.
- Current code evidence:
  - `playwright/api/createAgent.ts` runs `worker_license_creation` and `contract_signing` inside `Promise.all` and then classifies 401 as non-retryable.
  - `playwright/api/facility.ts` uses the same `worker_license_creation` endpoint but its outer helper delegates to shared `isRetryableE2eSetupError`, which treats non-403 setup errors as retryable. `createAgent.ts` is stricter and inconsistent for this setup-auth failure.

**Proposed fix:**

1. Preserve the failing setup step name in the thrown diagnostics, not only in console logs. A pragmatic implementation is to add a small `E2eSetupStepError` wrapper in `playwright/helpers/e2eSetupDiagnostics.ts` (or equivalent structured metadata) that carries `stepName`, `stepStatus`, HTTP diagnostics, and the original cause from `runE2eSetupStep()`.
2. Update `playwright/api/createAgent.ts` retry classification so a 401 from `worker_license_creation` is retryable at the existing `createAgentWithRetry()` whole-agent boundary. Keep 403 non-retryable. Avoid making every 401 globally retryable unless the preserved diagnostics prove it is from an E2E setup provisioning step with a valid prior admin token.
3. Prefer retrying the whole `createAgentWithRetry()` attempt with a fresh generated worker identity over retrying the individual create-license POST. That keeps the retry idempotent if a downstream service ever writes state before returning an auth-shaped error.
4. Add focused tests around the retry classifier / diagnostics helper if the repo has a nearby test harness pattern. At minimum, cover: 401 `worker_license_creation` is retryable, 403 remains non-retryable, missing admin token remains non-retryable, and existing 408/429/5xx behavior is unchanged.
5. In `[admin frontend]`, include `stepName`, request method, sanitized URL/service name, HTTP status, `apiGatewayRequestId`, and `traceparent` in the final `Failed to create agent after ...` diagnostics, not just in preceding console logs.

**Sibling candidates:**

- `playwright/api/facility.ts`: same `worker_license_creation` endpoint. It appears already more permissive via `isRetryableE2eSetupError`, but verify it still behaves correctly after any diagnostics wrapper change.
- `playwright/api/agent.ts`: legacy worker setup helper creates licenses and retries setup broadly; audit for diagnostic consistency, but avoid unrelated refactors.
- [ticket redacted] is a duplicate cluster member for the same `createAgent`/token-guard family and should be covered by the same implementation.

**Validation plan:**

- `npm run lint:fast -- playwright/api/createAgent.ts playwright/helpers/e2eSetupDiagnostics.ts playwright/api/facility.ts playwright/api/agent.ts`
- `npm run typecheck`
- If staging credentials are available, run the focused Playwright spec against staging: `npx playwright test playwright/e2e/licenses.spec.ts --grep "should be able to approve and reject license as admin and verify change license logs" --project "Desktop Chrome"`.
- If the implementation only changes classifier/helper logic and a unit test is added, run the smallest relevant Jest/Vitest command for that test file as well.

**Open questions:** None blocking. The implementation should be conservative and retry only the setup-auth case supported by the artifacts.

**Residual risk:** A real persistent license-manager authorization regression would still fail after the retry budget. Without backend auth reason telemetry, future 401s may still require API Gateway/Datadog correlation to determine whether the backend or test setup should own the fix.

## Acceptance Criteria

- [ ] `Agent.createAgentWithRetry()` retries the observed transient `worker_license_creation` 401 at the whole-agent setup boundary.
- [ ] Persistent permission failures such as 403 still bail immediately.
- [ ] Final setup failure diagnostics include the failing setup step name.
- [ ] [ticket redacted] and duplicate cluster member [ticket redacted] are referenced in the change body or implementation notes.
- [ ] Validation commands from the plan are run, or blockers are documented in the change.
