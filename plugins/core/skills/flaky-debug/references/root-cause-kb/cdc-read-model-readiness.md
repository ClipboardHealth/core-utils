# CDC and Read-Model Readiness

Last reviewed: 2026-07-16.

## Symptom signatures

- A create API returns success, then the UI's consuming API reports `Invalid workplace`, `Worker <id> not found`, missing offer/estimate data, or an opaque `500`.
- A fresh shift, offer, worker, or workplace is visible in the source service but not the downstream read model.
- A fixed sleep usually works but fails during load or an environment incident.
- An outer retry re-creates fresh entities on every attempt and never lets one entity finish propagating.

## Mechanism

The test creates data in a source-of-truth service and immediately exercises a UI path backed by another service or read model. CDC, event ingestion, or asynchronous projection has not made the new entity visible to the exact consuming path yet.

Readiness must be defined by the API/state the UI will consume. A successful producer response, an arbitrary sleep, or readiness in a different store does not prove the user path is ready.

## Affected repositories and surfaces

- `cbh-admin-frontend`: fresh shift offers, rate negotiation, Daily View, and other seeded E2E flows.
- `clipboard-health` and downstream services such as curated shifts: producer-to-read-model ingestion boundaries.
- Any test helper that creates cross-service data and then navigates immediately to a consumer.

## What fixed it

- Poll the same consuming API or deterministic state used by the UI.
- Bound the wait and fail with the last status, body, entity IDs, trace/request metadata, and attempt count.
- Retry only classified readiness failures; keep genuine validation errors fast-fail.
- Reuse or extract one shared per-repository readiness helper for the mechanism.
- Keep the same entity across readiness attempts. Do not re-seed and reset the CDC clock.

[STAFF-1010](https://linear.app/clipboardhealth/issue/STAFF-1010) established the accepted pattern: poll the same offer-estimate path used by the rate-negotiation dialog instead of extending a fixed CDC sleep. [cbh-admin-frontend#6780](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/6780) applied the shared bounded helper to shift-offer setup.

## What failed and why

- Increasing the fixed CDC sleep encoded a latency guess and provided no useful exhaustion evidence.
- The outer HCF retry created a new workplace/worker/shift each time; every retry restarted ingestion instead of waiting for the first entity.
- Matching only a detailed readiness message failed when the downstream service logged the specific cause but returned an opaque `500` to the client.
- Retrying all `422` responses in [cbh-admin-frontend#6974](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/6974) would have made real validation errors wait 90 seconds. Review narrowed the implementation so opaque `500`s retry while unrelated `422`s still fail fast.
- Adding a new per-spec readiness loop duplicates policy and lets timeout/classification behavior drift. Extend the shared helper instead.

## Current status

Known recurring mechanism with a documented A1 shared-helper rule in the flaky-fix rubric. The mechanism is not globally “fixed” because new producer/consumer boundaries continue to appear; the reusable resolution is a consuming-path readiness gate with classified failures and shared ownership.

## Evidence

- [STAFF-1010](https://linear.app/clipboardhealth/issue/STAFF-1010): canonical accepted plan for fresh shift-offer readiness.
- [cbh-admin-frontend#6780](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/6780): bounded shared shift-offer readiness helper.
- [cbh-admin-frontend#6792](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/6792): JSON:API readiness-message parsing used by the helper lineage.
- [cbh-admin-frontend#6974](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/6974): opaque `500` classification and reviewer-enforced `422` fast-fail behavior.
