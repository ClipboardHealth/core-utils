# Historical plan snapshot

## Implementation repositories

Primary investigation touched:

- [mobile frontend]
- ClipboardHealth/[worker gateway]
- ClipboardHealth/[home-health service]

The final fix may be either test setup hardening in `[mobile frontend]` or staging config/service alignment for the worker-app BFF home-health API target.

## Related investigation

- [ticket redacted]: `Worker accepts a visit invite > should accept a visit invite from the invites page`

## Evidence

Run [reference redacted]` failed after the invite and booking APIs succeeded:

- `GET /[home-health service]/api/v1/visits/invites` returned a valid invite for worker `6a28d0f9eb110465a75bf4a4`, workplace `Playwright Facility MPR sch8dgis`, visit `2c9d0d13-01f8-4bda-bb7a-a1656e7ed4a2`.
- `PATCH /[home-health service]/api/v1/visits/2c9d0d13-01f8-4bda-bb7a-a1656e7ed4a2` returned 200 with `status=FILLED` and `bookedWorkerId=6a28d0f9eb110465a75bf4a4`.
- The subsequent worker-app request returned 200 but empty data twice:
  `GET /worker-app/in-home/case/visit/?filter[booked]=true&filter[qualifications]=RN&include[]=case&include[]=workplace` => `{"data":[],"included":[]}`.

The same CI run also had an unticketed sibling failure in `Worker visit lifecycle`: the open visits list returned empty repeatedly for `filter[booked]=false` before any booking.

Datadog trace evidence:

- Worker-app BFF served `GET /worker-app/in-home/case/visit` using worker id `6a28d0f9eb110465a75bf4a4` and commit `531ec7f1f42caa6ef348784194b9acf56be81a51`.
- BFF called `cbh-[home-health service]-api.staging.service.local:3000/[home-health service]/api/v1/in-home-cases?filter[status]=OPEN&filter[booked]=true&filter[qualifications]=RN`.
- [home-health service] ran the raw `Cases`/`Visits` query with `c.status = OPEN`, `v.booked_worker_id = workerId`, and `LOWER(v.worker_req) = RN`, then returned no rows before workplace hydration.
- The public invite/booking requests in the browser are served as `hh-[home-health service]`, while the BFF read goes through internal `cbh-[home-health service]-api.staging.service.local`. They share the same home-health commit in the trace, but the read path did not see the newly created/updated visit.

## Suggested fix

- Confirm whether staging public Home Health API writes and worker-app BFF internal reads point at the same service/database and use the same route prefix. If not, align `HOME_HEALTH_API_URL` or the E2E setup base URL so read/write paths are consistent.
- In `[mobile frontend]` Home Health Playwright setup, add a worker-visible readiness check after creating a visit/invite or after booking:
  - poll `/worker-app/in-home/case/visit` as the worker until the seeded visit appears
  - fail during setup with worker id, visit id, case id, workplace id, BFF response body, and trace URL/details if it never appears
- Add regression coverage at the service boundary if feasible: create/seed an RN Home Health visit, then assert `/in-home-cases?filter[status]=OPEN&filter[booked]=false&filter[qualifications]=RN` returns it before booking and `filter[booked]=true` returns it after booking.

## Verification

- Re-run `playwright/e2e/homeHealth/workerAcceptsVisitInvite.spec.ts` against staging.
- Re-run `playwright/e2e/homeHealth/workerVisitLifecycle.spec.ts` because the same empty-list symptom appeared in the same run.
