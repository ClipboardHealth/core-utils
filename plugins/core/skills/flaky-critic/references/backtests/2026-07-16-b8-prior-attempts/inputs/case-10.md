# Historical plan snapshot

## Groundcrew

Repository: [admin frontend]
Implementation workflow: implement this ticket using the `cb-work` skill if available. If `cb-work` is unavailable, use the `core:go`/`go` skill. Follow this repo's AGENTS.md implementation workflow and run the documented verification.

In the change body, include this implementation ticket ID and investigation ticket `[ticket redacted]`.

```bash

```

## Task

Stabilize the shared Playwright E2E Cognito user provisioning path so freshly created facility/workplace/HCP users are not used for Cognito Admin API mutations before they exist in the staging Cognito user pool `us-west-2_HV1ibP3I6`.

Do not create per-test fixes. Diagnose and fix the shared setup path used by these fingerprints.

## Required Fix Shape

Implement one shared Cognito readiness/de-stressing mechanism instead of increasing per-test retries.

Required readiness signal:

- After [backend service]/test-helper user creation returns successfully, wait for `AdminGetUser` to succeed for the exact synthetic E2E user in pool `us-west-2_HV1ibP3I6` before calling `AdminSetUserPasswordCommand` or `AdminUpdateUserAttributesCommand`.
- For worker/HCP setup, also verify the returned Cognito user has enough expected identity attributes to safely apply the requested user-type attribute update. If the backend creates the user under a normalized username instead of raw email, resolve that username once and use it consistently for all later Cognito Admin calls.
- Treat `UserNotFoundException` as readiness-not-yet-met. Do not call password or attribute mutations until readiness is confirmed.

Required retry bound and behavior:

- Use a bounded wait that is long enough for staging Cognito propagation, with capped backoff and jitter. The existing 5 attempts spaced 2s apart is the observed insufficient bound; replace it with an explicit total timeout such as 60-90s unless investigation shows a better staging-specific bound.
- Retries must be idempotent. Re-running setup should not create duplicate users, repeatedly reset passwords for the same readiness miss, or fan out multiple identical Cognito Admin calls for one synthetic user.
- When many users are created in one setup path, limit or serialize Cognito Admin readiness/mutation calls enough to avoid adding burst pressure to Cognito/[backend service]. Prefer a small shared queue or existing repo helper over a new dependency.

Required exhaustion metadata:

- On timeout, fail with a single enriched error that includes pool ID, synthetic email or canonical username, setup helper path, requested mutation type (`password` or `userType`), total elapsed time, attempt count, last AWS exception name/code/status/request ID if available, last successful readiness state, GitHub run/job identifiers if available from env, and the originating test file/worker where practical.
- Keep real-user PHI out of logs. The failing users here are synthetic Playwright users, but helper logging should still avoid leaking unrelated user data.

## Observability to Reach 5/5 Confidence

Current confidence is 4/5 that this is one shared setup/backend-provisioning failure mode because direct staging [backend service]/Cognito telemetry was unavailable during investigation. The implementation should close that gap before the ticket is considered fully canonical.

Collect or add enough observability to prove which path is true:

- [backend service]/test-helper creates/imports the Cognito user successfully, but Cognito propagation is eventually consistent and the frontend harness must wait for `AdminGetUser` readiness.
- [backend service]/test-helper returns success before it has deterministically created/imported the Cognito user, so the true fix belongs in [backend service] or its test-helper contract.
- Cognito/backend throttling or burst pressure is delaying creation/readiness, so the harness must reduce concurrent Admin calls and expose enough timing data to verify the reduction.

Concrete signals to capture in Datadog, CI logs, or targeted helper instrumentation:

- Timestamp of [backend service]/test-helper user-create response for the synthetic email.
- Timestamp and outcome of each readiness probe, including `AdminGetUser` success or `UserNotFoundException`.
- Timestamp and outcome of the subsequent `AdminSetUserPasswordCommand` / `AdminUpdateUserAttributesCommand`.
- Total elapsed time from backend user-create success to Cognito readiness, grouped by helper path and user type.
- Any Cognito throttling, AWS SDK status, or [backend service] error/trace ID tied to the synthetic user creation.

Do not close this as 5/5 confidence from local green tests alone. Either attach the staging telemetry/CI evidence in the change or document why the fix had to move to [backend service]/auth infrastructure and link the follow-up implementation.

## Storm Details

Shared error signature:

```text
Error: Cognito user '[EMAIL]' does not exist in pool 'us-west-2_HV1ibP3I6' after 5 attempts. Ensure the user is provisioned in Cognito before running E2E tests.
```

Tests bundled: 6
Repos affected: 1
CI runs affected: 2
First failure: 2026-07-06T11:38:20Z
Last failure: 2026-07-06T11:43:46Z

- `9166129be528` — `playwright/e2e/myAccount.spec.ts:88`
- `26803343548f` — `playwright/e2e/auth.spec.ts:103`
- `43dfbdb912d9` — `playwright/e2e/placements/acceptApplication.spec.ts:144`
- `9bbc4081a989` — `playwright/e2e/facilityOnboarding.spec.ts:32`
- `63172183d01a` — `playwright/e2e/homeHealth/fullLifecycle.spec.ts:876`
- `6b98dfce6bf1` — `playwright/e2e/auth.spec.ts:182`

Runs:

- [[external evidence reference]]([external evidence reference])
- [[external evidence reference]]([external evidence reference])

## Investigation Findings

Failure surface: test setup/auth/data, before browser user-flow assertions.

Shared dependency: staging [backend service]/test-helper user creation plus AWS Cognito user pool `us-west-2_HV1ibP3I6`. CI config sets `E2E_ENVIRONMENT=staging` and `E2E_SERVICE_NAME=[backend service]`.

Shared helper path:

- `playwright/helpers/cognitoPassword.ts` calls `AdminSetUserPasswordCommand` for freshly created facility users and throws after five `UserNotFoundException` retries spaced 2s apart.
- `playwright/helpers/cognitoUserTypes.ts` has the sibling pattern for `AdminUpdateUserAttributesCommand` used by worker/HCP setup.
- Failing tests reach these through shared helpers such as `createFacilityUserWithRetry`, `createLtcFacilityWithUser`, `createHomeHealthcareWorkplaceWithUser`, `createHcfWithAssignedShiftWithRetry`, and `loginWithCognitoPassword`.

Representative CI evidence:

- Run [reference redacted]`, job `e2e-playwright-1`: `Created facility user ... email: playwright-gtygfpwvlhf@playwright-hcf.com`at`2026-07-06T11:43:07Z`, followed immediately by `Cognito user ... not found (attempt 1/5)`through attempt 4, then the test fails from`playwright/helpers/cognitoPassword.ts:65`.
- Run [reference redacted]`, job `e2e-playwright-1`: same sequence for `playwright-fovjnxnxzsj@playwright-hcf.com`; the helper fails after five attempts from `playwright/helpers/cognitoPassword.ts:65`.
- The failures occurred on separate self-hosted runners in the `cbh` group (`m8a.4xlarge`, `us-west-2b`), not one stale workspace.
- Current `origin/main` still has the same relevant setup code; no open `flaky-test-fix` change was found for this exact signature/fingerprints.

Datadog/incident check:

- Local Datadog CLI credentials were unavailable (`dog` and `~/.dogrc` absent).
- [incident.io]([external evidence reference]) telemetry has no configured telemetry datasource, so direct Datadog logs/metrics/traces could not be queried from this session.
- [incident.io]([external evidence reference]) did not show Cognito/staging/user-create incidents in `2026-07-06T11:00:00Z` to `2026-07-06T12:00:00Z`.
- One unrelated incident existed in the window: `INC-423` Stripe Payment Issues for Workers.
- One Platform Datadog alert existed in the window: production HCF login high latency at `2026-07-06T11:05:36Z`; this does not directly explain staging Cognito user provisioning.

Current confidence: 4/5 that this is one shared setup/backend-provisioning failure mode, not six independent test flakes. Confidence is not 5/5 because direct Datadog traces/logs for staging [backend service]/Cognito provisioning were unavailable.

## Acceptance Criteria

- [ ] The shared setup path waits on or deterministically creates/validates Cognito users before `AdminSetUserPassword`/`AdminUpdateUserAttributes` are called.
- [ ] Readiness is based on a concrete `AdminGetUser` success signal, with a documented timeout/backoff bound and clear behavior for `UserNotFoundException`, throttling, and final timeout.
- [ ] Timeout failures include the exhaustion metadata listed above so future flakes can be debugged from CI logs without rerunning the investigation.
- [ ] Retries are idempotent and do not amplify Cognito/backend throttling.
- [ ] The implementation reduces call burstiness where the shared setup creates multiple users or applies multiple Cognito mutations in one flow.
- [ ] The fix applies to all contained fingerprints, not individual test assertions.
- [ ] If [backend service] or auth infrastructure is the true fix locus, document the frontend harness evidence and implement in the correct repo or add the needed observability before closing.
- [ ] Add or update focused tests for the shared helper behavior where practical.
- [ ] Run the documented relevant verification for the changed repo.

## Suggested Starting Points

- `playwright/helpers/cognitoPassword.ts`
- `playwright/helpers/cognitoUserTypes.ts`
- `playwright/api/user.ts`
- `playwright/api/facility.ts`
- `playwright/api/homeHealth.ts`
- `playwright/helpers/login.ts`

Also inspect backend/test-helper behavior for `/api/facilityUser`, `/api/user/create`, and any JIT Cognito import path that should make new users appear in `us-west-2_HV1ibP3I6`.

## Related

Investigation: `[ticket redacted]`
