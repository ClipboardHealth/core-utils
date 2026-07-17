# Historical plan snapshot

## Implementation instructions

Implement the plan below in `[admin frontend]` using the `cb-work` skill or, if unavailable, the `core:go` skill.

Include this implementation ticket ID in the change body.

```bash

```

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
      "error": "Error: Failed to create agent after 1 attempt.\nDiagnostics: {\"historicalCorrelationKey\":\"[correlation redacted]\",\"correlationId\":\"[correlation redacted]\",\"githubRunId\":\"28798037729\",\"githubRunAttempt\":\"1\",\"githubJob\":\"e2e-tests-staging\",\"shardIndex\":\"3\",\"shardTotal\":\"4\",\"workerIndex\":\"1\",\"parallelIndex\":\"1\",\"pid\":[attempt reference redacted],\"stepName\":\"hcp_creation\",\"stepStatus\":\"failure\",\"durationMs\":166,\"requestMethod\":\"POST\",\"requestUrl\":\"[external evidence reference]",\"requestService\":\"api\",\"status\":400,\"responseShape\":{\"error\":\"string\",\"message\":\"string\",\"statusCode\":\"number\"},\"traceparent\":\"00-00000000000000001732fff1044f982e-197732b055021fe4-01\",\"apiGatewayRequestId\":\"AFm5ki1zvHcESJw=\",\"sanitizedResponseMessage\":\"Error while creating user\\nBad Request\",\"errorName\":\"AxiosError\",\"errorMessage\":\"Request failed with status code 400\",\"errorCode\":\"ERR_BAD_REQUEST\"}",
      "stack": "Error: Failed to create agent after 1 attempt.\nDiagnostics: {\"historicalCorrelationKey\":\"[correlation redacted]\",\"correlationId\":\"[correlation redacted]\",\"githubRunId\":\"28798037729\",\"githubRunAttempt\":\"1\",\"githubJob\":\"e2e-tests-staging\",\"shardIndex\":\"3\",\"shardTotal\":\"4\",\"workerIndex\":\"1\",\"parallelIndex\":\"1\",\"pid\":[attempt reference redacted],\"stepName\":\"hcp_creation\",\"stepStatus\":\"failure\",\"durationMs\":166,\"requestMethod\":\"POST\",\"requestUrl\":\"[external evidence reference]",\"requestService\":\"api\",\"status\":400,\"responseShape\":{\"error\":\"string\",\"message\":\"string\",\"statusCode\":\"number\"},\"traceparent\":\"00-00000000000000001732fff1044f982e-197732b055021fe4-01\",\"apiGatewayRequestId\":\"AFm5ki1zvHcESJw=\",\"sanitizedResponseMessage\":\"Error while creating user\\nBad Request\",\"errorName\":\"AxiosError\",\"errorMessage\":\"Request failed with status code 400\",\"errorCode\":\"ERR_BAD_REQUEST\"}\n    at /opt/actions-runner/_work/[admin frontend]/[admin frontend]/playwright/api/createAgent.ts:152:13\n    at /opt/actions-runner/_work/[admin frontend]/[admin frontend]/playwright/e2e/rateNegotiation.spec.ts:84:24\n    at WorkerMain._runTest (/opt/actions-runner/_work/[admin frontend]/[admin frontend]/node_modules/dd-trace/packages/datadog-instrumentations/src/playwright.js:1692:5)",
      "branch": "main",
      "pipeline": "[external evidence reference]",
      "commit": "1983e526d20ac66dc2c52102caeef8d6bba92cd2",
      "durationMs": 8074,
      "shard": "3/4",
      "timestamp": "2026-07-06T14:14:13Z"
    }
  ]
}
```

## Plan output

**Test ID:** `2f8cacf23bff`

**Confidence:** 4/5. The failing artifact shows `createAgentWithRetry()` bailed after one `hcp_creation` 400, and Datadog logs for the same trace show a Cognito `ConflictException` during backend user creation. The only inferred link is which identifier collided, because the API response intentionally returned a generic message.

**Failure surface:** test setup/auth/data.

**Current main status:** The failing code path still exists on current `origin/main`. Prior fixes are already available: `[reference redacted]` / `dcd544114bc` classified visible `Phone already in use` 400s, and `[reference redacted]` / `6d3f71348c7` scoped that retry to worker creation. This occurrence is not covered because the response body was only `Error while creating user\nBad Request`.

**Symptom:** In `playwright/e2e/rateNegotiation.spec.ts:84`, the first worker setup call fails before any browser user-flow assertion. `Agent.createAgentWithRetry()` reports `Failed to create agent after 1 attempt` even though its default max is 5, because `getAgentSetupRetryClassification()` returned `non_retryable_agent_setup_failure` and called `bail()`.

**Root cause:** The E2E worker setup retry classifier only treats `hcp_creation` HTTP 400 responses as retryable when the sanitized response includes `Phone already in use`. For this run, `POST /api/user/create` returned a generic 400. Datadog APM/logs for trace id `1671679822332401710` show the backend span `cbh-user POST /api/user/create`, HTTP 400, `BadRequestException: Error while creating user`, and a log error from `/app/src/modules/auth/services/cognito.service.ts` with `ConflictException` in `ensureIdentifierAvailableForEmployeeUpdate`. That is an identity collision/setup-data failure, but the frontend harness cannot see the precise backend conflict reason and therefore does not retry with the next generated worker identity.

**Evidence:**

- LLM report `/tmp/playwright-llm-report-28798037729/llm-report.json`: 52 tests, 1 flaky, failed attempt error `Failed to create agent after 1 attempt`, passed retry duration 28.475s.
- Failure diagnostics: `stepName=hcp_creation`, `POST [external evidence reference] status 400, `traceparent=00-00000000000000001732fff1044f982e-197732b055021fe4-01`, `apiGatewayRequestId=AFm5ki1zvHcESJw=`, sanitized response `Error while creating user\nBad Request`.
- Datadog APM: W3C trace low-64 id `1671679822332401710`; span `6264525095033341259`, service `cbh-user`, resource `POST /api/user/create`, HTTP status code 400, duration 113.5ms, `exception.message=Error while creating user`, `exception.type=BadRequestException`.
- Datadog logs for that trace: `Error while creating user`; error kind `ConflictException`; stack includes `CognitoService.throwRealWorkerConflict`, `classifyOrphanCandidates`, `ensureIdentifierAvailableForEmployeeUpdate`, `UserManipulationService.handleNewAgentInIdentityProviders`, and `UserManipulationService.createAgent`.
- Code path: `playwright/api/createAgent.ts` generates a fresh phone/email inside the retry callback, but `playwright/helpers/createAgentRetryClassification.ts` bails on this generic 400 shape.
- Existing regression coverage is in `scripts/createAgentRetryClassification.test.ts` and currently only covers the visible `Phone already in use` 400 case.

**Proposed fix:** Test harness fix.

- In `playwright/helpers/createAgentRetryClassification.ts`, extend the worker-creation 400 classifier narrowly. Treat this shape as retryable only when all of these hold: status is 400, diagnostics `stepName` is `hcp_creation`, `requestUrl` or `requestService` identifies `/api/user/create`, and `sanitizedResponseMessage` matches the generic user-creation bad request/conflict shape (`Error while creating user\nBad Request`, and optionally `Conflict Exception` if present).
- Return the existing `retryable_phone_collision` classification to minimize churn, or rename it to `retryable_worker_identity_collision` if the implementer wants the log label to match email/phone/Cognito identifier conflicts more accurately. If renamed, update the union type and tests in the same change.
- Do not classify all `hcp_creation` 400s as retryable; request-shape/schema failures should still fail fast.
- Add/extend Jest coverage in `scripts/createAgentRetryClassification.test.ts` for the generic `/api/user/create` 400 response and for a negative 400 case from an unrelated setup step or endpoint.

**Observability to reach 5/5:** Add a safe machine-readable reason to setup diagnostics or backend response/log tags, such as `worker_identity_conflict`, without exposing phone/email. Best options: have `cbh-user` tag/log the conflict classification on the `POST /api/user/create` span, and have `runE2eSetupStep` preserve a non-PII error code when the response includes one. That would remove the need to infer from backend stack names.

**Sibling candidates:**

- `playwright/api/createAgent.ts` is the failing class helper and should get the benefit through the shared classifier.
- `playwright/api/facility.ts` already documents the same backend generic `Error while creating user / Conflict Exception` collision shape around its HCP setup path; confirm whether its retry wrapper already converges or needs the same classification behavior.
- `playwright/api/agent.ts` has an older `createAgentWithRetry()` helper that retries all failures without this classifier; no immediate change required, but it is related setup surface.

**Validation plan:**

```bash
npx jest scripts/createAgentRetryClassification.test.ts --runInBand
npm run lint:fast -- playwright/helpers/createAgentRetryClassification.ts scripts/createAgentRetryClassification.test.ts
npm run typecheck
```

If the implementer can run staging E2E safely, also run the target spec shard or the single spec:

```bash
npx playwright test playwright/e2e/rateNegotiation.spec.ts --project=chromium
```

**Open questions:** None blocking. The implementation should use the current sanitized response shape and avoid relying on PII from Datadog logs.

**Residual risk:** If staging has enough retained test users that the 9M generated phone space produces frequent collisions, retries will reduce flake rate but not eliminate it forever. A later stronger fix could expand the valid generated phone space or add a test-only reserved identity namespace in the backend.
