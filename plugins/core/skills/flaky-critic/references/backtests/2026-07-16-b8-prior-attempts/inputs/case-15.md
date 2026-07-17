# Historical plan snapshot

## Parent

[ticket redacted] (flakiness program spec), Workstream C.

## Groundcrew

Repository: [admin frontend]
Implementation workflow: use the `core:cb-work`/`cb-work` skill when available. If that skill is unavailable, follow this repo's [AGENTS.md/CLAUDE.md]([external evidence reference]) implementation workflow and run the documented verification.

## What to build

[ticket redacted] (available) made the backend return the Cognito username from admin user creation. Username-based Cognito operations are strongly consistent; the harness's current resolve-by-email path goes through the eventually consistent alias index, which is the root cause of the "Cognito user does not exist" storm family. Switch the Playwright harness to consume the returned username for all post-creation Cognito operations, then **delete the armor that only existed to absorb the lookup race**: the PreSignUp readiness probe, oversized readiness budgets (the ~90s window), and any throttle/retry logic whose sole purpose was surviving alias-index lag. Keep armor that guards genuinely different hazards (e.g. cross-process rate-limit throttling for call volume).

First step: verify the username field is actually present in the staging environment's responses (the contract available; deployment matters). If absent, stop and report rather than building against a phantom.

## Acceptance criteria

- [ ] Harness user setup consumes the username from the creation response; no post-creation resolve-by-email remains on the setup path.
- [ ] Obsolete probe/budget/retry code is deleted, each deletion named in the change body with the hazard it guarded now being impossible.
- [ ] Auth-dependent spec pass rate is unchanged or better across repeated CI runs (state the runs checked).
- [ ] A classification note distinguishes deleted armor (lookup-lag) from retained armor (rate-limit volume) so reviewers can check the boundary.

## Notes

Evidence: staging-seed-reliability deep dive; [ticket redacted] storm; consumer-side mitigations 152fe5ea8d7/32c31abeeef. Mobile mirror is a separate ticket that adopts this ticket's approach.
