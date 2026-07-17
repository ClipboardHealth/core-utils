# Historical plan snapshot

## Implementation instructions

Implement or adopt the plan below in `[admin frontend]` using the `cb-work` skill or, if unavailable, the `core:go` skill.

Required workflow:

- Include this implementation ticket ID in the change body.
- Implement this plan using the `cb-work` skill or, if unavailable, the `core:go` skill.

## Flake details

```json
{
  "repo": "[admin frontend]",
  "test": "Schedule rate negotiations (redesign) — desktop workplace user accepts one rate proposal and ends another from the shift details drawer",
  "file": "playwright/e2e/rateNegotiation.spec.ts:40",
  "framework": "playwright",
  "isNewFlaky": false,
  "failures": [
    {
      "error": "Error: Failed to create agent after 1 attempt.\nDiagnostics: {\"historicalCorrelationKey\":\"[correlation redacted]\",\"correlationId\":\"[correlation redacted]\",\"githubRunId\":\"28413169950\",\"githubRunAttempt\":\"1\",\"githubJob\":\"e2e-tests-staging\",\"shardIndex\":\"3\",\"shardTotal\":\"4\",\"workerIndex\":\"0\",\"parallelIndex\":\"0\",\"pid\":62278,\"stepName\":\"hcp_creation\",\"stepStatus\":\"failure\",\"durationMs\":55,\"requestMethod\":\"POST\",\"requestUrl\":\"[external evidence reference]",\"requestService\":\"api\",\"status\":400,\"responseShape\":{\"error\":\"string\",\"message\":\"string\",\"statusCode\":\"number\"},\"traceparent\":\"00-0000000000000000688e121ea4b1822a-3a53dc9499469a1c-01\",\"apiGatewayRequestId\":\"fwBzChg3vHcEP5A=\",\"sanitizedResponseMessage\":\"Phone already in use\\nBad Request\",\"errorName\":\"AxiosError\",\"errorMessage\":\"Request failed with status code 400\",\"errorCode\":\"ERR_BAD_REQUEST\"}",
      "stack": "Error: Failed to create agent after 1 attempt.\nDiagnostics: {\"historicalCorrelationKey\":\"[correlation redacted]\",\"correlationId\":\"[correlation redacted]\",\"githubRunId\":\"28413169950\",\"githubRunAttempt\":\"1\",\"githubJob\":\"e2e-tests-staging\",\"shardIndex\":\"3\",\"shardTotal\":\"4\",\"workerIndex\":\"0\",\"parallelIndex\":\"0\",\"pid\":62278,\"stepName\":\"hcp_creation\",\"stepStatus\":\"failure\",\"durationMs\":55,\"requestMethod\":\"POST\",\"requestUrl\":\"[external evidence reference]",\"requestService\":\"api\",\"status\":400,\"responseShape\":{\"error\":\"string\",\"message\":\"string\",\"statusCode\":\"number\"},\"traceparent\":\"00-0000000000000000688e121ea4b1822a-3a53dc9499469a1c-01\",\"apiGatewayRequestId\":\"fwBzChg3vHcEP5A=\",\"sanitizedResponseMessage\":\"Phone already in use\\nBad Request\",\"errorName\":\"AxiosError\",\"errorMessage\":\"Request failed with status code 400\",\"errorCode\":\"ERR_BAD_REQUEST\"}\n    at /opt/actions-runner/_work/[admin frontend]/[admin frontend]/playwright/api/createAgent.ts:152:13\n    at /opt/actions-runner/_work/[admin frontend]/[admin frontend]/playwright/e2e/rateNegotiation.spec.ts:84:24\n    at WorkerMain._runTest (/opt/actions-runner/_work/[admin frontend]/[admin frontend]/node_modules/dd-trace/packages/datadog-instrumentations/src/playwright.js:1692:5)",
      "branch": "main",
      "pipeline": "[external evidence reference]",
      "commit": "21ec4288614efa471d7bed32665e198ef06b313d",
      "durationMs": 8519,
      "shard": "3/4",
      "timestamp": "2026-06-30T01:05:53Z"
    }
  ]
}
```

## Plan output

**Test ID:** `2f8cacf23bff`

**Confidence:** 5/5. The failure response says `Phone already in use`, the shard log shows `POST /api/user/create` returned HTTP 400 during `hcp_creation`, and the local retry classifier bails on that exact 400 instead of using the already-existing fresh-identity retry loop.

**Failure surface:** Test setup/auth/data.

**Current main status:** The failing commit `21ec4288614e` already included the prior rate-negotiation setup hardening (`[ticket redacted]`, commit `03a650774a2`) and license auth retry hardening (`[ticket redacted]`, commit `9264bcc2d62`). Current `origin/main` still does not include change [reference redacted] (`fc06672eaa4`), which directly addresses this phone-collision path.

**Symptom:** The first Playwright attempt failed before browser flow with `Failed to create agent after 1 attempt`; the retry passed. The available LLM report for run [reference redacted]` has one flaky test, this spec, with failed attempt duration about 8.5s and a passing retry around 28s.

**Root cause:** `Agent.createAgentWithRetry()` generates a fresh worker phone/email inside each retry attempt, but `getAgentSetupRetryClassification()` classifies all unrecognized HTTP 400 setup failures as `non_retryable_agent_setup_failure`. The backend returned a deterministic setup-data collision, `Phone already in use`, so the helper called `bail()` after the first attempt and never tried the next generated identity.

**Evidence:**

- LLM report summary: 53 total tests, 50 passed, 1 flaky, 0 failed; the only flaky test is `playwright/e2e/rateNegotiation.spec.ts:40`.
- Failed attempt timeline has no app network and a blank screenshot, confirming pre-browser setup failure.
- Shard log for job [reference redacted]`at`2026-06-30T01:06:01Z`: `POST [external evidence reference] 400`, response body `{"statusCode":400,"message":"Phone already in use","error":"Bad Request"}`.
- Setup diagnostics: `stepName=hcp_creation`, `stepStatus=failure`, `status=400`, `traceparent=00-0000000000000000688e121ea4b1822a-3a53dc9499469a1c-01`, `apiGatewayRequestId=fwBzChg3vHcEP5A=`, `sanitizedResponseMessage="Phone already in use\nBad Request"`.
- Code path: `playwright/e2e/rateNegotiation.spec.ts:83-84` calls `agentInstance1.createAgentWithRetry()` and `agentInstance2.createAgentWithRetry()`; `playwright/api/createAgent.ts` catches setup errors and bails when `getAgentSetupRetryClassification()` returns `non_retryable_agent_setup_failure`; `playwright/helpers/createAgentRetryClassification.ts` lacks a retryable phone-collision branch on current `origin/main`.
- Existing fix found: change [reference redacted] / commit `fc06672eaa4` adds `retryable_phone_collision` for HTTP 400 `Phone already in use` and a Jest regression test.

**Proposed fix:** Test harness fix. Land change [reference redacted] or implement the equivalent small change in `playwright/helpers/createAgentRetryClassification.ts` and `scripts/createAgentRetryClassification.test.ts`: classify HTTP 400 setup errors whose sanitized response message includes `Phone already in use` as retryable. Prefer constraining the check to `hcp_creation` if updating the change, because the retry is safe specifically when the helper will generate a fresh worker identity on the next attempt.

**Observability to reach 5/5:** N/A -- confidence is 5/5. The existing setup diagnostics already include lifecycle step, request URL/service, status, sanitized response message, traceparent, and API Gateway request ID.

**Sibling candidates:**

- `playwright/e2e/licenses.spec.ts` and `playwright/e2e/legacy/documents/documents.spec.ts` use the same class-based `Agent` helper, so they will benefit from the shared classifier fix.
- `playwright/api/agent.ts` helper functions already retry `createAgent` with a fresh generated phone and do not use this stricter classifier, so they are not the immediate broken path.
- `playwright/api/facility.ts` has separate HCP setup paths using `generatePhoneNumber()`; leave as follow-up only if future failures show the same `Phone already in use` signature there.

**Validation plan:**

- `npx jest scripts/createAgentRetryClassification.test.ts --runInBand`
- `npm run lint:fast -- playwright/helpers/createAgentRetryClassification.ts scripts/createAgentRetryClassification.test.ts`
- `npm run typecheck`
- Verify change CI stays green, especially the Playwright shard containing `playwright/e2e/rateNegotiation.spec.ts`.

**Open questions:** None blocking. If updating change [reference redacted], decide whether to narrow the phone-collision classifier to `hcp_creation` before integration.

**Residual risk:** A generated phone can collide repeatedly if staging has accumulated enough historical test users, but five fresh attempts make this specific flake unlikely. A longer-term hardening would increase worker identity entropy or allocate test phone ranges deterministically per run/shard.
