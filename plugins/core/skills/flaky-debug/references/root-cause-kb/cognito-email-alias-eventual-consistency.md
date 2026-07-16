# Cognito Email-Alias Eventual Consistency

Last reviewed: 2026-07-16.

## Symptom signatures

- `Cognito user '<email>' does not exist in pool '<pool>'` immediately after the user-create API returned success.
- `AdminSetUserPassword` or `AdminUpdateUserAttributes` raises `UserNotFoundException` when called with an email.
- A bounded retry sometimes passes under light load and fails as a storm under overlapping CI runs.
- Direct lookup by the opaque username succeeds while lookup or mutation by email still fails.

## Mechanism

Backend user creation stores Cognito users under opaque usernames such as `from_admin_<uuid>` and stores the email as an attribute/alias. When the producer discards that username, the test harness must rediscover the identity through Cognito's email-alias index. That lookup path is eventually consistent; the strongly consistent username path is already available but was not returned across the API contract.

This mechanism is distinct from Cognito throttling. Throttling can lengthen the propagation tail, but a `UserNotFoundException` from email-based resolution after a proven successful create is an identity-contract mismatch.

## Affected repositories and surfaces

- `clipboard-health`: workplace/facility user creation and the backend-main contract.
- `cbh-admin-frontend`: Playwright password and user-type provisioning for freshly created synthetic users.
- Other consumers that create a Cognito identity through backend-main and then address Cognito Admin APIs by email.

## What fixed it

- Return the opaque Cognito username from the user-creation response and contract.
- Use that username for subsequent Cognito Admin mutations instead of resolving by email.
- Fail loudly or emit explicit telemetry when Cognito provisioning fails, rather than returning an apparently usable user with no identity.
- Keep a readiness probe only as a migration guard for producer paths that cannot yet return the username.

The producer-side contract fix landed in [clipboard-health#26862](https://github.com/ClipboardHealth/clipboard-health/pull/26862) for [STAFF-1793](https://linear.app/clipboardhealth/issue/STAFF-1793).

## What failed and why

- Five `UserNotFoundException` retries spaced two seconds apart guessed that email propagation would finish within ten seconds. The guess usually held, then failed under load.
- The 75–90 second readiness implementation in [cbh-admin-frontend#7380](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7380) was useful diagnostic armor but remained consumer-side: it still paid the eventually consistent email-resolution cost and added Cognito Admin calls.
- Increasing the wait cannot fix a swallowed producer failure where no Cognito identity was created. The producer must distinguish absence from propagation.
- Treating the whole storm as throttling alone would preserve the incorrect email-based identity contract.

## Current status

The workplace-user producer contract now exposes the strongly consistent username. Consumer paths should delete email-resolution probes as they adopt the contract. Keep this entry active until all fresh-user setup paths, including worker/HCP variants, use a returned username or another deterministic identity.

## Evidence

- [STAFF-1667](https://linear.app/clipboardhealth/issue/STAFF-1667): storm family with six tests and the shared `Cognito user does not exist` signature.
- [STAFF-1672](https://linear.app/clipboardhealth/issue/STAFF-1672): consumer-side readiness design.
- [cbh-admin-frontend#7380](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7380): closed readiness implementation and its bounded-wait diagnostics.
- [STAFF-1793](https://linear.app/clipboardhealth/issue/STAFF-1793): producer-side root fix.
- [clipboard-health#26862](https://github.com/ClipboardHealth/clipboard-health/pull/26862): returned username, fail-loud behavior, cleanup, and metrics.
