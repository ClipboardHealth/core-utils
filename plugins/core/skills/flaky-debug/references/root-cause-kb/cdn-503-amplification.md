# CDN 503 Amplification for Hashed Assets

Last reviewed: 2026-07-16.

## Symptom signatures

- Hashed JavaScript or CSS assets return CloudFront `503`, often `LimitExceeded`.
- A short S3 website-origin error burst becomes about ten seconds of identical edge failures.
- Client import retries and one reload all receive the same cached error.
- Failures cluster immediately after deploy when E2E begins against a cold CloudFront cache.
- Many routes fail together because their chunks share the same distribution/origin.

## Mechanism

Deploy-time cold-cache demand creates a request stampede against the S3 website endpoint. A brief origin `5xx` is cached by CloudFront's default error TTL, so every retry replays the edge-cached error after the origin may already have recovered. Hashed assets without immutable cache headers also miss an opportunity to stay resident in browsers and at the edge.

The CDN turns a short origin blip into a wider, longer outage. Client recovery is necessary but cannot succeed while the error itself is pinned.

## Affected repositories and surfaces

- `cbh-admin-frontend`: frontend deploy action and CloudFront/S3 Terraform.
- `cbh-mobile-app`: HCP webapp CloudFront/S3 Terraform.
- Staging E2E and real browser route loads that fetch content-hashed assets through those distributions.

## What fixed it

- Set `error_caching_min_ttl = 0` for transient `500`, `502`, `503`, and `504` responses.
- Upload content-hashed JavaScript/CSS with `Cache-Control: public, max-age=31536000, immutable`.
- Preserve short/default caching for stable-named runtime/configuration files.
- Add per-status CloudFront metrics and access logs so the next burst can distinguish origin latency, cache behavior, and specific error codes.

The infrastructure fixes landed in [cbh-admin-frontend#7010](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7010) and [cbh-mobile-app#12288](https://github.com/ClipboardHealth/cbh-mobile-app/pull/12288).

## What failed and why

- The central `loadLazily` retry ladder ran three imports and one reload within the period where CloudFront served the same cached error. Correct client recovery was defeated by edge policy.
- E2E preflight and deployed-asset graph checks from [cbh-admin-frontend#5942](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/5942), [#5957](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/5957), and [#5958](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/5958) improved detection and reduced canary pressure but did not remove error pinning.
- Selective invalidation in [cbh-admin-frontend#5840](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/5840) reduced deploy churn but did not change the transient-error TTL.
- Adding more test retries would increase the cold-cache stampede and continue replaying the cached `503`.

## Current status

Fixed in Terraform for both frontend distributions. Origin failover remains deliberately deferred; add it only if measured bursts still fail after error caching is disabled. The log-forwarding/pipeline follow-up is operational observability, not required to understand the mechanism.

## Evidence

- [STAFF-1470](https://linear.app/clipboardhealth/issue/STAFF-1470): cross-repository CDN amplification work.
- [cbh-admin-frontend#7010](https://github.com/ClipboardHealth/cbh-admin-frontend/pull/7010): error TTL, immutable hashed assets, metrics, and access logs.
- [cbh-mobile-app#12288](https://github.com/ClipboardHealth/cbh-mobile-app/pull/12288): mobile distribution port of the infrastructure fix.
- [cbh-mobile-app#11898](https://github.com/ClipboardHealth/cbh-mobile-app/pull/11898): deployed-asset preflight and the linked root-cause analysis used by both Terraform fixes.
