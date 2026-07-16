# STAFF-1818 blind-backtest cohort

## Cohort definition

- Date range: 2026-06-01 through 2026-07-16, inclusive.
- Fixed size: 20 historical flaky-test-fix changes.
- Outcome balance: 14 approve, 6 reject.
- Selection: every one of the six labeled changes that ended without integration in the interval, plus 14 integrated changes selected for browser E2E, mobile E2E, service/unit-test, product-race, setup/auth, retry-classification, third-party, time-boundary, locator, and CI/config variety.
- Order: deterministically shuffled into neutral case filenames; outcome classes are not grouped.

## Plan-snapshot source

Each input is the issue-description payload from the timestamped GitHub comment created by the Linear integration when the implementation issue was linked to its change. This captures the contemporaneous plan and embedded evidence at link time, before later human review or closing context. The outer integration HTML, linked issue heading, review link, and all source identifiers are excluded.

Snapshot completeness: all 20 linkback comments contained a readable, non-truncated issue-description payload.

## Audit fields

Each answer-key entry records the exact GitHub permalink of the timestamped Linear-linkback comment (planCommentUrl), its capture timestamp (planCapturedAt), the SHA-256 of the corresponding sanitized case input (inputSha256), and preOutcomeVerified=true. Pre-outcome verification compares the plan-comment timestamp with the integration timestamp for approve cases, the human requested-change review timestamp where one exists, and otherwise the human closure timestamp for weak reject labels. The independently consumable hashes are also listed in input-hashes.txt, sorted by neutral filename.

## Outcome-label caveats

- Thirteen approve cases were verified as integrated and carrying the frontend repositories' release marker.
- One non-E2E service-test approve case was verified as integrated and reviewed, but its repository does not use that release marker; this is a repository-convention caveat, not a negative signal.
- Only one reject case has a strong contemporaneous human quality judgment: a requested-change review rejecting the implementation direction.
- Five reject labels are weak: one stale/not-pursued case, two supersession-like cases, and two human closures without a final public quality rationale. These must not be treated as equally strong ground truth.

## Correlated families

- Cases 01, 10, and 15 share a Cognito/auth identity family; case 15 is a later replacement direction.
- Cases 05 and 20 share worker-creation collision/retry mechanics.
- Cases 03, 08, 14, and 16 share a home-health product surface but use distinct immediate mechanisms.
- Case 19 is also auth-related but concerns a different setup retry mechanism.

## Sanitization

Inputs contain only the historical Linear issue-description snapshot and its contemporaneous embedded evidence. Source repository/change/ticket identifiers, URLs, labels, integration/release language, closing context, session identifiers, attempt-to-fix identifiers, and outcome-revealing comments are excluded. No leak-term survivor is justified; the required scans must return zero matches.
