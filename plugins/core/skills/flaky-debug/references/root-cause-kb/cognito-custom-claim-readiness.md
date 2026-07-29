# Cognito Custom-Claim Readiness

Last reviewed: 2026-07-29.

## Symptom signatures

- Onboarding reaches the email step, but a refreshed Cognito ID token lacks `custom:cbh_user_id`.
- The token contains a worker claim for a different user after an interrupted or retried onboarding attempt.
- Whole-flow retries create new identities, while the original Cognito-to-worker link remains unresolved.

## Mechanism

Worker creation and Cognito claim linking cross a persistence and identity-provider boundary. The backend previously reported onboarding success even when the Cognito attribute update failed or was not yet visible in a refreshed token. The client then advanced with an identity that could authenticate but could not be associated with the expected worker.

This is distinct from email-alias eventual consistency and Cognito API throttling. The username is known and authentication succeeds; the missing readiness signal is the expected custom worker claim in the refreshed token.

## Affected repositories and surfaces

- `clipboard-health`: onboarding worker creation, resumable Cognito linking, and pending-link persistence.
- `cbh-mobile-app`: onboarding email-stage progression and Playwright setup diagnostics.
- Any onboarding consumer that treats a successful worker write as proof that the corresponding identity claim is observable.

## What fixed it

- Persist the Cognito subject while the worker link is pending and resume the same worker on retry.
- Surface identity-link failures instead of swallowing them and returning apparent readiness.
- Refresh the token with a bounded schedule and require `custom:cbh_user_id` to match the expected worker before advancing.
- Emit typed, sanitized `claim_missing`, `claim_mismatch`, and refresh-failure outcomes without retrying the whole onboarding flow.

[clipboard-health#27035](https://github.com/ClipboardHealth/clipboard-health/pull/27035) made the backend link resumable and fail loud. [cbh-mobile-app#12969](https://github.com/ClipboardHealth/cbh-mobile-app/pull/12969) added the consuming claim-readiness gate and exact diagnostic outcomes.

## What failed and why

- Swallowing the Cognito update error let the route report success before identity readiness existed.
- Retrying the whole signup flow created another phone/email and obscured whether the original link completed.
- Waiting for navigation or extending the email-step timeout did not inspect the token claim that the authenticated application consumes.
- Treating the burst as email-alias lag or throttling did not match the retained evidence: authentication requests succeeded and no `TooManyRequestsException` was present.

## Current status

Fixed for the mobile onboarding path covered by [STAFF-1868](https://linear.app/clipboardhealth/issue/STAFF-1868). Future sightings should distinguish claim absence, claim mismatch, refresh failure, alias lookup, and quota throttling before selecting an entry.

## Evidence

- [STAFF-1868](https://linear.app/clipboardhealth/issue/STAFF-1868): seven-test burst, token evidence, and cross-repository causal chain.
- [clipboard-health#27035](https://github.com/ClipboardHealth/clipboard-health/pull/27035): pending-link persistence, same-worker resume, and fail-loud backend behavior.
- [cbh-mobile-app#12969](https://github.com/ClipboardHealth/cbh-mobile-app/pull/12969): bounded claim verification, typed diagnostics, and focused component/helper coverage.
