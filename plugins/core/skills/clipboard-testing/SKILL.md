---
name: clipboard-testing
description: End-to-end testing playbook for Clipboard Health changes. Use when the user wants to verify, exercise, or set up test data for a backend or frontend change against a live environment — "test my change end-to-end", "verify this works in dev", "create a test workplace / worker / shift", "get a shift through to paid / invoiced", "prove the API change works". Defaults to the `development` AWS environment, API-first (cbh CLI tokens + curl). The skill knows enough to run the core happy-path flow (workplace → worker → shift → clock in/out → pay → invoice) autonomously; for anything else, it orients around the codebase and asks the user for missing directories.
allowed-tools: Bash, Read, Grep, Glob
---

# Clipboard Testing

This skill lets you verify Clipboard Health changes end-to-end against `development`. It is opinionated about two things:

- **API-first.** curl against the dev gateway with tokens from `cbh auth gentoken`. No packages to install.
- **Concepts over memorized payloads.** Field shapes and validation rules change. The skill teaches you *what owns what* and *where to read current truth* — not a fixed cookbook.

The one area where the skill carries enough detail to run alone is the **core happy-path flow** (create workplace → create worker → create shift → book → clock in/out → trigger pay → generate invoice). Everything else is concept + controller pointer + "read the file before you call it".

## What this skill is for

Orient around the Clipboard codebase and:

1. Pick the right **service** for a given change.
2. Pick the right **actor / token** for a given endpoint.
3. Find the right **controller file** for the current payload shape and guard.
4. Run the **core flow** on your own to set up baseline test data.
5. **Verify** a change via API read-back, Mailpit, Datadog, or the admin webapp.

## When to ask the user

- If a recipe in the "concepts" section doesn't include a curl and you need one, **ask the user whether to grep the controller in their workspace, or whether they can paste a known-working request.**
- If a sibling repo referenced in the repo map is not present under `$CBH_ROOT`, **ask the user to point you to its path** (they may have it somewhere else).
- If the skill instructs you to "read the controller to confirm the body shape" and you can't find the file, **ask** before guessing.
- **Never** fabricate endpoint paths, field names, or guard decorators. When uncertain, grep or ask.

## Repository map

Default root assumed: `$CBH_ROOT=/Users/<me>/repos/cbh` (adjust — the skill should detect `$CWD` and ask if the path differs).

| Repo | What lives there |
|---|---|
| `clipboard-health/` | **Main backend monolith (aka backend-main).** Shifts, workers (HCP), workplaces (facilities), invites, shift blocks, bookability rules, invoicing triggers. Mongo. |
| `payment-service/` | Payments + bonuses. Transfers (Clipboard Stripe → worker Express), payouts (Express → external), bonus entities, external payment accounts, payment blockers. **Own Mongo — source of truth for payment state.** |
| `home-health-api/` | Home Health product: cases, visits (typed), visit occurrences. **Postgres.** Standalone NestJS. Not behind the gateway. |
| `documents-service-backend/` | Documents (presigned uploads, approval) and licenses (incl. NLC `multiState` flag). Own deployment + Datadog service (`document-service`). |
| `shift-reviews-service/` | Post-shift ratings + **preferred workers** (reasons: `FAVORITE`, `RATING`, `INTERNAL_CRITERIA`). Postgres. |
| `attendance-policy/` | Clock-in windows **plus** attendance scores, score adjustments, restrictions, market-level config. Controllers: `/policies`, `/restrictions`, `/scores`, `/workers`, `/markets`. |
| `urgent-shifts/` | Urgency tier computation (`NCNS`, `LATE_CANCELLATION`, `LAST_MINUTE`) + urgent-shift-specific rules. |
| `worker-app-bff/` | Worker-facing BFF. **Read-only / proxy** for most domain data. Don't send writes here. |
| `worker-service-backend/` | Worker-service endpoints (worker-side reads and some writes). |
| `cbh-api-gateway/` | API gateway config — routes `/api`, `/payment`, `/worker`, `/license-manager`, `/reviews`, etc. |
| `license-manager/` | License lifecycle + state sync (backing the documents license flow). |
| `cbh-backend-notifications/` | Notification dispatch (push, email, SMS). |
| `cbh-chat-service/` | In-app chat between workers and workplaces. |
| `cbh-admin-frontend/` | **admin-webapp** — serves both **CBH employees** and **facility users** (mobile-friendly). UI branches on who's logged in. |
| `admin-app/` | Legacy admin frontend (being superseded by `cbh-admin-frontend`). Check this only if something is missing above. |
| `cbh-mobile-app/` | Worker mobile app (Ionic + native). Also exposes a dev PWA at `hcp-webapp.development.clipboardhealth.org`. |
| `clipboard-facility-app/` | Legacy Flutter facility app (being phased out; replaced by `admin-webapp`). Usually don't need this. |
| `cbh-core/packages/cli/` | The `cbh` CLI — `auth gentoken`, `seed-data`, `local-package`, `dev up`. |
| `cbh-core/packages/testing-e2e-admin-app/` | Canonical **reference payloads** and **AdminService method shapes** — read but do not import at runtime; shapes can be stale. |
| `cbh-infrastructure/` | Terraform. URLs, Cognito pools, SES/Mailpit, network firewalls. |

**Long-tail repos** that might be relevant for specific features — `open-shifts/`, `shift-verification/`, `pricing-service/`, `worker-eta/`, `cbh-location-service/`, `authentication/`, `red-planet/`, `cbh-evidence/`, `invite-generator/`. Ask the user which domain a change touches before guessing.

If any of these aren't present in `$CBH_ROOT`, ask the user.

## Actors, tokens, apps

Three human Cognito App Clients + one impersonation variant + S2S.

| clientName | Actor | App surface |
|---|---|---|
| `admin-app` | CBH employee | `admin-webapp.development.clipboardhealth.org` (also serves facility users) |
| `worker-app` | Worker (HCP) | `hcp-webapp.development.clipboardhealth.org` + native mobile |
| `workplace-app` | Facility user (legacy) | Flutter app being phased out. New facility users log into `admin-webapp` via `admin-app` flow. |
| `worker-app-impersonated` | Employee acting as a worker | admin-webapp impersonation mode |

Token flavours via `cbh auth gentoken`:

```bash
# Human (Cognito user)
cbh auth gentoken user development <email> [-n <clientName>]   # default -n admin-app

# Firebase ID token (frontend AUTH_TOKEN handoff — rarely needed for API tests)
cbh auth gentoken email development <email>

# Service-to-service
cbh auth gentoken client development backend-main
cbh auth gentoken client development payment-service
```

All dev signup and login emails land in **Mailpit** at `https://mailpit.tools.cbh.rocks/` (basic-auth; creds in 1Password).

## Environment reference — `development` only

| Service | Base URL / mount |
|---|---|
| API gateway | `https://apigateway.development.clipboardhealth.org` (`$API_BASE`) |
| backend-main | `$API_BASE/api` |
| payment-service | `$API_BASE/payment` |
| worker-service | `$API_BASE/worker` |
| license-manager | `$API_BASE/license-manager` |
| documents (REST) | `$API_BASE/api/documents` |
| documents (GraphQL) | `$API_BASE/docs/graphql` |
| shift-reviews | `$API_BASE/reviews` |
| attendance-policy | `https://attendance-policy.dev.clipboardstaffing.com` (**`dev`**, not `development`) |
| home-health-api | Confirm — usually `home-health-api.development.clipboardhealth.org` or the gateway-rewritten `$API_BASE/home-health-api`. Ask the user if unsure. |
| Invoiced.com sandbox | `https://qa.billterms.com` (fully stubbed in dev) |
| Mailpit | `https://mailpit.tools.cbh.rocks` |
| Admin webapp | `https://admin-webapp.development.clipboardhealth.org` |
| Worker PWA | `https://hcp-webapp.development.clipboardhealth.org` |

## Prerequisites

```bash
# Current cbh CLI
cbh --version   # expect 8.x
# upgrade: npm install --global @clipboard-health/cli@latest

# Dev VPN connected (gateway + Mailpit require it)

# Smoke test
cbh auth gentoken client development backend-main -q | head -c 40 ; echo

# Install jq
jq --version
```

Ask the user for:
- The admin email they want to act as (e.g. `e2e@clipboardhealth.com` or their own).
- Mailpit credentials if you need to drive signup/login.
- `$CBH_ROOT` if not `/Users/<me>/repos/cbh/`.

---

# Core flow — self-sufficient

This section carries enough to drive the happy path **without reading further**. Each step captures an ID used by later steps. Pointed at workplace type **LTC** (the dominant marketplace segment).

## Setup

```bash
export API_BASE=https://apigateway.development.clipboardhealth.org

# Admin (CBH employee) — used for most setup writes
export ADMIN_EMAIL=<ask user>
export ADMIN_TOKEN=$(cbh auth gentoken user development "$ADMIN_EMAIL" -q)

# Service-to-service — used for payment-service writes initiated from backend-main
export S2S_BACKEND_MAIN=$(cbh auth gentoken client development backend-main -q)
```

The worker token gets minted **after** you create the worker. `POST /api/user/create` (Step 2) creates the Cognito user as a side effect, so you do NOT need to drive hcp-webapp signup + Mailpit to pre-confirm the email — the cbh CLI can mint a worker token immediately after the create call returns.

Resolve your admin userId once (used as `addedBy`/`sessionUser`/`adminId` in many downstream calls — the constants.ts default is stale):

```bash
export ADMIN_USERID=$(curl -sS "$API_BASE/api/user/getByEmail?email=$ADMIN_EMAIL" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '._id')
```

**Faster fallback — decode the JWT.** If `getByEmail` is unreachable or returns null, `ADMIN_USERID` is in the token at the `custom:cbh_user_id` claim, and the user type is at `custom:user_types`:

```bash
PAYLOAD=$(echo "$ADMIN_TOKEN" | cut -d. -f2); LEN=$(( ${#PAYLOAD} % 4 ))
[ $LEN -ne 0 ] && PAYLOAD="$PAYLOAD$(printf '=%.0s' $(seq 1 $((4-LEN))))"
echo "$PAYLOAD" | tr '_-' '/+' | base64 -d | jq '."custom:cbh_user_id", ."custom:user_types"'
```

**Pick an admin with an `EmployeeProfile` doc.** The plain `@AllowClipboardHealthEmployees()` decorator passes for any JWT with `custom:user_types: EMPLOYEE` (so workplace creation works for almost any CBH email). But `ShiftCreateAuthorizer` (`src/modules/shifts/entrypoints/internal/shift-create.authorizer.ts:54`) additionally requires an `EmployeeProfile` keyed by your `userId`, and many real CBH dev users don't have one. Symptom: shift create returns generic `403 {"code":"PermissionDenied","detail":"Forbidden resource"}` with no detail. **Default to `e2e@clipboardhealth.com` for shift writes** unless the user explicitly hands you another admin email and confirms it has an EmployeeProfile.

**Invoice-only fast path:** if all the user wants is a billable shift to invoice (no real money flow, no Stripe, no payouts), you can skip Steps 4 (Stripe), 5 (worker token isn't needed), and 9 (transfer/payout). Minimum chain: Step 1 → 2 → 3 → 6 → 7 → "test-data shortcut" in Step 8 (`PUT /api/shift/put` with `verified:true`) → re-run Step 7 if `agentId` got cleared → Step 10 with `includeUnverifiedInErrors:true` and segment `not-generated-with-errors`.

## Step 1 — Create a workplace (LTC)

Validator at `clipboard-health/src/modules/facilityProfile/services/middlewares/createFacilityProfileValidator.middleware.ts`. Required: `rushFee`, `lateCancellation`, `netTerms`, `disputeTerms`, `ratesTable`, `holidayFee`, `sentHomeChargeHours`, plus a rate entry for **every** qualification enabled for the workplace type (the validator iterates qualifications and `check("rates.{q}").exists()` — missing rate keys are reported as `"Invalid rate - X doesn't exist"`, which means *missing*, not *unrecognized*). For LTC today that's also: `NP`, `QMAP`, `Server`, `Janitor`, `Site Lead`, `Medical Aide`, `Medical Technician`, `Respiratory Therapist`, `Dental Hygienist`, `Dental Assistant`, `CNA On Call`. **`salesforceID` regex: exactly 15 or 18 alphanumeric chars** (`/^[0-9a-zA-Z]{15}([0-9a-zA-Z]{3})?$/`). Response uses `id`, not `_id`.

```bash
SFID=$(printf "INVTEST%08d" $((RANDOM)))   # 15 chars
curl -sS -X POST "$API_BASE/api/facilityprofile/create" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d @- <<JSON | jq '{workplaceId: .id, message}'
{
  "name": "test facility core-flow",
  "email": "core-flow@clipboardhealth.com",
  "phone": "4155550100",
  "type": "Long Term Care",
  "fullAddress": {
    "streetNumber": "14", "streetName": "Grove St", "city": "San Francisco",
    "region": "San Francisco County", "state": "California", "stateCode": "CA",
    "country": "United States", "countryCode": "US", "postalCode": "94102",
    "formatted": "14 Grove St, San Francisco, CA 94102, USA"
  },
  "geoLocation": {"type": "Point", "coordinates": [-122.4153089, 37.7791078]},
  "metropolitanStatisticalArea": "San Francisco-Oakland-Berkeley, CA",
  "manualMsa": false,
  "tmz": "America/Los_Angeles",
  "rates": {
    "CNA": 30, "LVN": 45, "NURSE": 50, "RN": 55, "CAREGIVER": 25,
    "CHEF": 39, "Chef": 39, "COOK": 28, "HOUSEKEEPER": 22,
    "Dental Hygienist": 61, "Dietary Aide": 18, "Dining Assistant": 20,
    "Dental Assistant": 55, "Dishwasher": 18, "Janitor": 25,
    "Medical Aide": 22, "Medical Technician": 26,
    "NP": 60, "QMAP": 30, "Respiratory Therapist": 40,
    "Server": 18, "Site Lead": 28, "CNA On Call": 32
  },
  "rushFee": {"differential": 26, "period": "9"},
  "lateCancellation": {"period": "2", "feeHours": "9"},
  "netTerms": "26",
  "disputeTerms": "98",
  "ratesTable": {
    "sunday":    {"am": "94","pm": "47","noc": "53"},
    "monday":    {"am": "68","pm": "29","noc": "45"},
    "tuesday":   {"am": "57","pm": "88","noc": "62"},
    "wednesday": {"am": "29","pm": "99","noc": "12"},
    "thursday":  {"am": "100","pm": "64","noc": "44"},
    "friday":    {"am": "60","pm": "93","noc": "19"},
    "saturday":  {"am": "7","pm": "5","noc": "20"}
  },
  "holidayFee": [],
  "salesforceID": "$SFID",
  "sentHomeChargeHours": "92"
}
JSON
```

Capture `WORKPLACE_ID`. Reference body: `cbh-core/packages/testing-e2e-admin-app/src/lib/constants.ts → DEFAULT_CREATE_LONG_TERM_CARE_FACILITY_REQUEST_BODY`. The qualification key strings must match `HcpWorkerType` enum values in `cbh-core/packages/testing-e2e-admin-app/src/lib/admin-interface.ts` (e.g. `MEDICAL_TECHNICIAN = "Medical Technician"`).

## Step 2 — Create a worker

Endpoint is **`POST /api/user/create`** (handler: `clipboard-health/src/modules/user/controllers/user.controller.ts → createUser`, contract: `userContract.createUser`). The legacy `/api/agentProfile/bulk` is gone.

The controller's `userManipulationService.createAgent` calls `cognitoService.createCognitoUser` at the end of the flow, so you do **not** need to pre-sign-up via hcp-webapp + Mailpit. The Cognito user is created in the same call. Note the contract schema (`createUserRequestSchema`) doesn't actually declare `password` — the field is optional today, but mint the worker token via `cbh auth gentoken user development $WORKER_EMAIL -n worker-app -q` immediately after creation to confirm Cognito is set up.

Resolve your own admin userId first (it's used as `addedBy` and as `sessionUser` for downstream calls — the constants.ts default `60841c3970071101613e1c50` is stale):

```bash
ADMIN_USERID=$(curl -sS "$API_BASE/api/user/getByEmail?email=$ADMIN_EMAIL" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '._id')
```

Then:

```bash
export WORKER_EMAIL=invoice-test-$(date +%s)@clipboardhealth.com
PHONE=$(printf "415555%04d" $((RANDOM % 10000)))
REFCODE=$(LC_ALL=C tr -dc A-Z0-9 < /dev/urandom | head -c 8)
SSN_BLOB='bd5xJwROoChe9OxqJP/YhvY7YALpAdfrbblPNZOJoaifIIuUc7+kuuj+F91hYj/...'  # full blob from constants.ts

curl -sS -X POST "$API_BASE/api/user/create" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d @- <<JSON | jq '{workerId: ._id, email, phone: .agent.phone}'
{
  "email": "$WORKER_EMAIL",
  "type": "AGENT",
  "addedBy": "$ADMIN_USERID",
  "tmz": "America/Los_Angeles",
  "firstName": "Test", "lastName": "Worker", "name": "Test Worker",
  "phone": "$PHONE",
  "dob": "1998-08-06",
  "employmentStatus": "1099",
  "referralCode": "$REFCODE",
  "fullSocialSecurityNumber": "$SSN_BLOB",
  "address": {
    "streetNumber": "12", "streetName": "Grove Street", "city": "San Francisco",
    "region": "San Francisco County", "state": "California", "stateCode": "CA",
    "country": "United States", "countryCode": "US", "postalCode": "94102",
    "formatted": "12 Grove St, San Francisco, CA 94102, USA",
    "metropolitanStatisticalArea": "San Francisco-Oakland-Berkeley, CA",
    "manualMsa": false
  },
  "geoLocation": {"coordinates": [-122.4152307, 37.7788487], "type": "Point"},
  "license": {"state": "California"}
}
JSON
```

Capture `WORKER_ID`. **All workers are 1099 today** — but the field IS still required by the request schema; pass `"employmentStatus": "1099"`. The error path `BadRequestException("Error while creating user")` swallows the underlying reason — to debug, check Datadog (the controller logs the full error before re-throwing).

**Workers start in `ONBOARDING` stage**, not `ENROLLED`. Bookability rules block `/api/shifts/claim` for ONBOARDING workers. For test data, prefer the admin-assign path (Step 7) which can override most rules.

**"Email address already in use" — recover the existing worker.** If `/api/user/create` returns `400 "Email address already in use"`, the worker already exists. Look it up by email — `agentprofile/search` and `agentProfile/search` reject email input with `"Must be a valid ObjectId"` (they take a userId), the right one is `GET /api/user/agentSearch?searchInput=<email>` (CBH-employee gated). Response surfaces both `_id` (agentProfile document) and `userId` (User document). **For shift `agentId`, use `userId`** — that's what the shift's `agentId` field references.

```bash
WORKER_USERID=$(curl -sS "$API_BASE/api/user/agentSearch" -G \
  --data-urlencode "searchInput=$WORKER_EMAIL" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.list[0].userId')
```

## Step 3 — Set qualification + create license

Two separate writes. Both required before assignment — `WORKER_MISSING_LICENSE` ("agent qualification doesn't meet requirements") fires if either is missing, even when assigning with `override: true`.

```bash
# (a) Set the agentProfile.qualification field
curl -sS -X PUT "$API_BASE/api/agentprofile/put" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d "{\"agentId\":\"$WORKER_ID\",\"qualification\":\"CNA\",\"licensedStates\":[\"CA\"]}" | jq

# (b) Create a real license in license-manager (state "Any" + multiState=false works for any-state shifts)
curl -sS -X POST "$API_BASE/license-manager/workers/$WORKER_ID/licenses" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"multiState":false,"status":"ACTIVE","state":"Any","qualification":"CNA","number":"1234567890","expiresAt":"2027-09-17T23:59:59-07:00"}' | jq
```

The contractor-agreement signing (`PATCH $API_BASE/worker/agentprofile/signContractorAgreement` — note: lives on **worker-service**, takes the worker token, not admin) is only needed for the worker-self-claim path. The admin-assign override path skips it. If you need it later: body is `{agreementVersion:"V6", signature:"<name>"}`.

## Step 4 — Connect Stripe (so payments work)

Stripe Express account + external bank/card must be attached. The endpoint and body vary — grep `clipboard-health/src/modules/stripe` and `payment-service/src/app/accounts` for current shape. `AdminService.createPaymentAccountForHcp` in `cbh-core/packages/testing-e2e-admin-app/src/lib/admin-service.ts` is the best single reference for the full flow.

If you can't reach Stripe sandbox, the transfer step (9) will fail but the rest of the flow still works up to shift-completed. Ask the user if they want to skip Stripe (mark as deferred) or fix it.

## Step 5 — Mint the worker token

```bash
export WORKER_TOKEN=$(cbh auth gentoken user development "$WORKER_EMAIL" -n worker-app -q)
```

## Step 6 — Create a shift

Two endpoints work today:

- **Legacy `POST /api/shift/create`** (singular `shift`) — flat body, schema `shiftCreateBodySchema` in `clipboard-health/packages/contract-backend-main/src/lib/shifts.contract.ts`. Required: `start`, `end`, `agentReq`, `admin`, `facilityId`. Max 17h between start and end. Response is the raw shift document with `_id`.
- **New `POST /api/v3/shifts`** — JSON:API body, contract `shiftContract.create` in `node_modules/@clipboard-health/contract-backend-main/src/lib/shiftV3.contract.ts`, controller `src/modules/shifts/entrypoints/shift-create.controller.ts`. The comment in that controller says it's "going to replace the old POST /api/shift/create endpoint". Response is JSON:API `{ data: { id, attributes: { schedule, requirements, charges, pay, ... } } }`.

Both routes are gated by the same `ShiftCreateAuthorizer` — see the **EmployeeProfile gotcha** in Setup. If your admin lacks an `EmployeeProfile` you'll get `403 {"code":"PermissionDenied","detail":"Forbidden resource"}` regardless of which path you pick.

Legacy (still works, no JSON:API ceremony):

```bash
START=$(date -u -v-10H +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || date -u -d '-10 hours' +%Y-%m-%dT%H:%M:%S.000Z)
END=$(date -u   -v-2H  +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || date -u -d '-2 hours'  +%Y-%m-%dT%H:%M:%S.000Z)
# Use a past window for invoice/test-data flows; future window for live booking.

curl -sS -X POST "$API_BASE/api/shift/create" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d "{\"start\":\"$START\",\"end\":\"$END\",\"agentReq\":\"CNA\",\"admin\":true,\"facilityId\":\"$WORKPLACE_ID\"}" \
  | jq '{shiftId: ._id, charge, pay, time}'
```

v3 (preferred for new flows; if your change touches the new endpoint, exercise it directly):

```bash
curl -sS -X POST "$API_BASE/api/v3/shifts" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d "{\"data\":{\"type\":\"shift\",\"attributes\":{\"schedule\":{\"startAt\":\"$START\",\"endAt\":\"$END\",\"timeSlot\":\"am\"},\"requirements\":{\"qualificationName\":\"CNA\"}},\"relationships\":{\"workplace\":{\"data\":{\"id\":\"$WORKPLACE_ID\",\"type\":\"workplace\"}}}}}" \
  | jq '{shiftId: .data.id, charges: .data.attributes.charges, pay: .data.attributes.pay}'
```

Capture `SHIFT_ID`. Source for legacy: `clipboard-health/src/modules/shifts/controllers/shifts.controller.ts:744 @Post("/create")` (note `@Controller(["/api/shifts","/api/shift"])` — both prefixes match). Source for v3: `entrypoints/shift-create.controller.ts`. The shifts module now has many controllers (`shifts.controller.ts`, `shifts-v1.controller.ts`, `shifts-v1-legacy.controller.ts`, `shifts-v2.controller.ts`, `shifts-v2-legacy.controller.ts`, `entrypoints/shift-create.controller.ts`); when you can't find a route, grep across **all** of them and prefer `entrypoints/` for newer code.

## Step 7 — Book/assign the shift

`POST /api/shifts/claim` is dual-purpose: workers self-claim, employees admin-assign (via `AdminShiftService.adminShiftAssign`). The body schema is the same in both cases:

```ts
{ agentId, shiftId, offerId, sessionUser, override?, missingDocs? }
```

**`offerId` is required and must be a real offer.** Pass a random UUID and you get `400 "The offered rate for this shift is no longer valid"` — that's `ClaimShiftOfferService` doing a curated-shifts lookup. Two-step flow for admin:

```bash
# (a) Create the offer (admin-only, JSON:API body — yes, this one is JSON:API even though shift create isn't)
OFFER_ID=$(curl -sS -X POST "$API_BASE/api/shifts/$SHIFT_ID/offers" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d "{\"data\":{\"type\":\"shift-offer\",\"attributes\":{}},\"relationships\":{\"worker\":{\"data\":{\"type\":\"worker\",\"id\":\"$WORKER_ID\"}}}}" \
  | jq -r '.data.id')

# (b) Claim/assign — override:true bypasses non-fatal bookability rules (still checks license + qualification)
curl -sS -X POST "$API_BASE/api/shifts/claim" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d "{\"agentId\":\"$WORKER_ID\",\"shiftId\":\"$SHIFT_ID\",\"offerId\":\"$OFFER_ID\",\"override\":true,\"sessionUser\":\"$ADMIN_USERID\"}" | jq
```

Worker self-claim (skip the offer creation if the worker's app already requested an offer; otherwise the worker token can also POST `/api/shifts/:id/offers`):

```bash
curl -sS -X POST "$API_BASE/api/shifts/claim" \
  -H "Authorization: Bearer $WORKER_TOKEN" -H "Content-Type: application/json" \
  -d "{\"agentId\":\"$WORKER_ID\",\"shiftId\":\"$SHIFT_ID\",\"offerId\":\"$OFFER_ID\",\"sessionUser\":\"$WORKER_ID\"}" | jq
```

If admin-assign 4xx's with a bookability error, `override:true` covers most rules but **not** `WORKER_MISSING_LICENSE` (you must complete Step 3) or `FACILITY_CHARGE_RATE_MISSING` (the workplace's `rates.{qualification}` must exist). Bookability rule list: `clipboard-health/src/modules/shifts/rules/bookability/constants/constants.ts`. Per-rule debug: `GET /api/shifts/:id/state` (worker token).

## Step 8 — Clock in, then clock out (or skip via verified=true)

Live worker path (use this for "real" booking flows in a *future* shift window):

```bash
NOW=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
curl -sS -X POST "$API_BASE/api/shifts/record_timekeeping_action/$SHIFT_ID" \
  -H "Authorization: Bearer $WORKER_TOKEN" -H "Content-Type: application/json" \
  -d "{\"stage\":\"CLOCK_IN\",\"location\":[-122.4153089,37.7791078],\"locationType\":\"LIVE\",\"appType\":\"APP\",\"connectivityMode\":\"ONLINE\",\"shiftActionTime\":\"$NOW\",\"shiftActionCheck\":\"LOCATION\"}" | jq
```

Two important traps for **test data flows**:
- A freshly-created worker has **no background check** → worker-token clock-in returns `422 "You can't work as you don't have a valid background check."` (`WORKER_HAS_INVALID_BACKGROUND_CHECK`). No way around this from the API surface alone.
- Calling the same endpoint with an admin token does **not** retroactively clock in a past shift — `getActionTimestamp` always uses `startOfMinute(new Date())` for admin-driven actions, ignoring `body.shiftActionTime`. Admin-stamped clock actions only make sense during an active shift window.

**Test-data shortcut — mark verified directly.** For invoice generation and most billing flows you don't need real clock times; you need a shift with `agentId` set, `verified: true`, and a non-zero `time`:

```bash
CLOCK_OUT=$(date -u -v-3H +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || date -u -d '-3 hours' +%Y-%m-%dT%H:%M:%S.000Z)
curl -sS -X PUT "$API_BASE/api/shift/put" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d "{\"shiftId\":\"$SHIFT_ID\",\"adminId\":\"$ADMIN_USERID\",\"updatedInfo\":{\"time\":5.5,\"verified\":true,\"clockInOut\":{\"end\":\"$CLOCK_OUT\"}}}" | jq
```

⚠️ **Side effect:** setting `verified:true` via this update has been observed to clear `agentId`. After the verify-update, **read the shift back and re-run Step 7 (offer + claim)** if `agentId` is null. Confirm before invoice work — the invoice segments query has `agentId: { $exists: true, $ne: null }` so a wiped agent silently filters the workplace out.

The dedicated `POST /api/shift/verification/verify` endpoint exists but takes a more involved `signatory` shape (`{name, role, phone, email, signedAt, method, signatoryId}`) and 500s easily — `PUT /api/shift/put` with `updatedInfo.verified=true` is more reliable for setup.

Other verification types beyond LOCATION (`NFC`, `MANUAL`, `INTEGRATION`) — see the Concepts section. Source: `clipboard-health/src/modules/shift-timekeeping/timekeeping-actions/controllers/shift-time-keeping-action-v2.controller.ts`.

`shiftAdjustmentSchema.adjustmentType` enum (in case you need it for a real adjustment): `preInvoicePreference | preInvoiceDispute | postInvoiceDispute | other` — **not** `TIME` / `PAY` etc. And the adjustment endpoint refuses to run on an unverified shift (`"Cannot adjust shift because it is not yet verified."`), so verify first.

## Step 9 — Pay the worker (transfer → payout)

**Payments are 2-step and live in `payment-service`.** backend-main initiates; payment-service owns the record of truth.

```bash
# Transfer: Clipboard Stripe → worker's Express account (S2S from backend-main)
curl -sS -X POST "$API_BASE/payment/accounts/$WORKER_ID/transfers" \
  -H "Authorization: Bearer $S2S_BACKEND_MAIN" -H "Content-Type: application/json" \
  -d "{\"shiftId\": \"$SHIFT_ID\", \"idempotencyKey\": \"skill-$(date +%s)\"}" | jq

# Verify transfer landed
curl -sS "$API_BASE/payment/accounts/$WORKER_ID/transfers" \
  -H "Authorization: Bearer $S2S_BACKEND_MAIN" | jq '.[] | select(.shiftId=="'"$SHIFT_ID"'") | {status, amount, stripeTransferId: .transferObject.id}'

# Payout: Express → external account (worker-initiated)
curl -sS -X POST "$API_BASE/payment/accounts/authenticated/payout" \
  -H "Authorization: Bearer $WORKER_TOKEN" -H "Content-Type: application/json" \
  -d '{}' | jq

# Read worker's latest payout
curl -sS "$API_BASE/payment/payouts/workers/$WORKER_ID" \
  -H "Authorization: Bearer $WORKER_TOKEN" | jq
```

Transfer amount is driven by the shift payout calculation — if the request body shape complains, grep `payment-service/src/app/payments/transfers/accounts-transfers.controller.ts` and confirm. For a per-shift breakdown (including bonuses/reversals), use `POST /payment/payments/shift-payment-details`.

## Step 10 — Generate an invoice for the workplace

Invoices are **manually triggered by a CBH employee**, not scheduled. In dev they target the Invoiced.com sandbox (fully stubbed — no real money). Path is **`/api/payment/sendInvoices`** (`/api/`-prefixed, not `/payment/...`).

The body is **not** `{workplaceIds: [...]}`. Schema (`sendInvoicesBodySchema` in `paymentInvoice.contract.ts`) requires `start`, `end`, `includeUnverifiedInErrors`, `selectedIdsMap`, `appUrl`, `sentBy`, `sentByEmail`. The `selectedIdsMap` is keyed by **invoice segment type** (`not-generated | not-generated-with-errors | invoices-with-errors | invoices-without-errors`), **not** workplace ID — workplace IDs go into the `includedIds` array under the relevant segment.

A shift with no clockInOut times lands in `not-generated-with-errors`. Pass `includeUnverifiedInErrors: true` to include it.

```bash
START_DATE=$(date -u -v-30d +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || date -u -d '-30 days' +%Y-%m-%dT%H:%M:%S.000Z)
END_DATE=$(date -u -v+1d   +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || date -u -d '+1 day'   +%Y-%m-%dT%H:%M:%S.000Z)

# Dry-run with preview:true to confirm the workplace is picked up before enqueueing the job
curl -sS -X POST "$API_BASE/api/payment/sendInvoices" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d @- <<JSON | jq
{
  "start": "$START_DATE",
  "end": "$END_DATE",
  "includeUnverifiedInErrors": true,
  "selectedIdsMap": {
    "not-generated-with-errors": {
      "selectAll": false,
      "includedIds": ["$WORKPLACE_ID"],
      "excludedIds": []
    }
  },
  "appUrl": "https://admin-webapp.development.clipboardhealth.org",
  "sentBy": "$ADMIN_USERID",
  "sentByEmail": "$ADMIN_EMAIL",
  "preview": true
}
JSON

# Real trigger: same body with "preview": false (or omit). Returns 202; the job runs async.
# List invoices for this workplace (wait ~30–60s for the job to land)
curl -sS "$API_BASE/api/invoice?pageNumber=1&facilityId=$WORKPLACE_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.invoiceList'
```

Pre-check segments to find which bucket the workplace lands in (helpful when preview returns 0 workplaces):

```bash
curl -sS "$API_BASE/api/payment/invoiceSegments/list?start=$START_DATE&end=$END_DATE&segmentType=not-generated-with-errors&facilityId=$WORKPLACE_ID&includeUnverifiedInErrors=true" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.[] | {_id, name: .facility.name}'
```

Mongo match for invoice eligibility (`InvoiceSegmentsRepository`): `agentId: {$exists: true, $ne: null}`, `start` in date range, not deleted (or deleted-with-`isBillable:true`). With `includeUnverifiedInErrors:false`, also requires `profit > 0` and verified=true with non-null clockInOut. So an "ideal" billable shift has `agentId` set, `verified:true`, both `clockInOut.start` and `clockInOut.end` populated, and `charge > pay`.

For deep verification, read `clipboard-health/src/modules/payment/controllers/payment-invoice.controller.ts` and `.../modules/invoice/services/invoice-segments.service.ts`.

## Full orchestration — one-shot smoke

Run steps 1–10 in order. Halt on the first non-200. Each step captures the ID the next step needs. Assert at the end:
- Shift has `agentId` populated, `verified:true`, no `cancelledAt`. (Re-read after Step 8 — the `verified:true` update can clear `agentId`.)
- Transfer row exists in `payment-service` with `status = "COMPLETED"`. (Skipped on the invoice-only fast path.)
- Payout row exists for this worker, recent. (Skipped on the invoice-only fast path.)
- Invoice row exists for the workplace via `GET /api/invoice?pageNumber=1&facilityId=$WORKPLACE_ID` with a non-null `invoicedComId`.

---

# Concepts — everything beyond the core flow

Short. Pointers, not recipes. When you need a concrete call, open the controller cited and read the guard + DTO.

## Worker lifecycle (stages)

Enum in `clipboard-health/src/workers/constants/workerStages/index.ts`. Stages: `ONBOARDING → ENROLLED → PROBATION → RESTRICTED → DEACTIVATED → SOFT_DELETED`. Only `ENROLLED` and `PROBATION` can book freely. `RESTRICTED` books only at **preferred** workplaces. `DEACTIVATED` can still log in unless `loginBlocked=true`.

## Shift state is derived, not stored

There is no single `ShiftStatus` enum. Infer from `agentId`, `cancelledAt`, clock actions, `deleted`, `isSentHome`. The worker-facing derived state is at `GET /api/shifts/:id/state` — use that, don't build your own.

## Bookability — introspect, don't guess

~50 rules in `clipboard-health/src/modules/shifts/rules/bookability/constants/constants.ts`. When "worker cannot book", always hit `GET /api/shifts/:shiftId/state` first; the response names the failing rule. Common causes: no Stripe, no signed agreement, missing/expired license (check `multiState` flag and NLC states), missing document requirement, deactivated/restricted stage, shift in past, worker already on an overlapping shift.

## Shift assignment variants

Four paths to "assigned":
1. **Instant book** — `POST /api/shifts/claim` (default for almost all shifts).
2. **Invite** — `POST /api/shift-invites` (workplace/admin creates; worker `PATCH` to accept). Controller: `clipboard-health/src/modules/shifts-invites/shift-invite.controller.ts`.
3. **Shift block** — facility/admin creates a bundle (`POST /api/shift-blocks`); worker claims the block via `POST /api/shift-blocks/:id/booking-requests`. Controllers: `clipboard-health/src/modules/shift-blocks/controllers/{shift-blocks, booking-requests}.controller.ts`.
4. **Admin manual assign** — CBH employee assigns from admin-webapp; backend endpoint in `shifts.controller.ts`. Handy for test data setup.

## Clock-in variants beyond LOCATION

`shiftActionCheck ∈ {LOCATION, NFC, MANUAL, INTEGRATION}`.

- **NFC** — scan a facility-provided tag, requires a `complianceProof` S3 upload (`timeclock-compliance-proof-upload-url`).
- **MANUAL** — timekeeping disabled at that workplace. Worker submits a timecard afterward (`PUT /api/v2/shifts/timecard/:shiftId`); admin approves.
- **INTEGRATION** — external timeclock vendor. Vendor carried in `verificationMethod`: `UKG_INTEGRATION | UKG_READY_INTEGRATION | ATTENDANCE_ON_DEMAND_INTEGRATION | MESH_INTEGRATION` (the four `EXTERNAL_TIMEKEEPING_VERIFICATION_METHODS`), or video-based `TAKE_A_VIDEO | AI_TAKE_A_VIDEO`. Backend queries the vendor's API via an adapter to fetch the real punch timestamp.

Stages include `CLOCK_IN | LUNCH_OUT | LUNCH_IN | SKIP_LUNCH | CLOCK_OUT | SHIFT_TIME_DONE`.

## Missed-punch (fully functional, phased rollout)

Works in production in some MSAs; phased rollout across the marketplace. Not a stub. Notification keys include `missedPunchRequestApproved | Declined`. REST surface can be sparse depending on rollout state — grep `clipboard-health/src/**/missed*Punch*` for current endpoints before relying on them.

## Urgency tiers

Driven by lead time + reason, not a hand-settable flag. Enum in `clipboard-health/src/services/urgentShifts/constants.ts`. Tier 1 `NCNS` (previous worker no-showed), Tier 2 `LATE_CANCELLATION`, Tier 3 `LAST_MINUTE` (posted within 12h of start). Drives notification cadence. Assigned internally by `SetShiftUrgencyService`.

## Cancellation — billing is timing+contract, not reason

Billing check (from `FcfWorkerPayoutService.getCancellationPaymentParams`):

```
isBillable =
  leadTime < facility.lateCancellation.period
  && facility.lateCancellation.feeHours !== 0
  && !isWorkerLateBeyondThreshold   // >20min late
  && !hasInvalidPayoutValues
```

No reason code exempts the workplace by itself. Escape hatches: outside late-cancel window, `feeHours=0`, worker very late.

Paths:
- Worker cancel — `POST /api/shifts/worker-cancel-request` (reasons: `SICK`, `TRANSPORTATION`, `BABYSITTER_ISSUE`, …).
- Facility cancel (two-step) — `PATCH /api/shifts/:id/facility-cancelled-me/request` → `.../approve` (or `.../reject`). Reasons: `LOW_CENSUS`, `STAFFED_IN_HOUSE`, `STAFFED_OTHER_REGISTRY`, `NO_CALL_NO_SHOW`, `FACILITY_USER_SUBMIT_SENT_HOME`, `WORKER_IS_LATE`, `OTHER`.
- Sent home (mid-shift) — routed through the same facility-cancel flow with `FACILITY_USER_SUBMIT_SENT_HOME`; separate `getSentHomePayoutParams` computes partial pay.
- Left early (recorded *about* a worker, **not** filed *by* one) — `POST /api/worker-left-early-requests`. Body is **JSON:API** with `type: "worker-left-early-request"` and attributes `{shiftId, replacementRequested, leftWithPermission, comment}`. Contract: `node_modules/@clipboard-health/contract-backend-main/src/lib/workerLeftEarlyRequests.contract.ts`. Controller: `src/modules/worker-left-early/entrypoints/worker-left-early.controller.ts`. The route's decorator is `@AllowAnyAuthenticatedUser`, **but** `WorkerLeftEarlyAuthorizer` only accepts: (1) `EMPLOYEE` with an `EmployeeProfile`, or (2) `WORKPLACE_USER` who `worksAt(facilityId)`, is verified+non-suspicious, AND has role `ADMIN | SHIFT_MANAGEMENT | DOCUMENTS` or the `POST_SHIFT_PERMISSION` permission. **Worker tokens get 403 "Unauthorized user".** Use the admin (e2e) token or a facility-user token. Returns the request with optional `replacementShiftId` if `replacementRequested:true`. Read-back: `GET /api/worker-left-early-requests/:id?include[]=shift&include[]=worker` (path param is the WLE request id, not the shift id, despite the contract's `ShiftIdSchema` typing).
- Admin delete — `POST /api/shift/:id/delete` with `ADMIN_EDIT_SHIFT | ADMIN_MIGRATION`.

Always dry-run with `GET /api/shifts/:id/cancellationParams` before asserting `isBillable` / `isPayable`.

## Bonuses — the entity lives in payment-service

Initiated from backend-main for many reasons (shift completion bonuses, sent-home fees, cancellation fees, **Home Health occurrence payouts**, discretionary admin bonuses). worker-app-bff is read-only.

Schema fields that matter: `amount` (paid to worker), `charge` (billed to workplace; `0` or `null` = no charge), `billable` (default `true`; `false` skips from upcoming charges), `facilityId`, `agentId`, `shiftId`, `reason`, `status`. **No `chargesFacility` field.** Reversal: `POST /api/bonus-payments/:id/reversals`.

Upcoming-charges integration is async: `BonusPaymentCreated` SQS → consumer → job inserts if `charge > 0 && billable !== false`, removes if `charge === 0`. Wait ~30s between bonus creation and checking upcoming charges.

## Home Health — Case → Visit → Occurrence

Separate backend (`home-health-api`, Postgres), same mobile and admin apps.

- **Case** = a patient owned by a Home Health agency workplace.
- **Visit** = a scheduled appointment, **typed** (e.g. admission visit which must be done by an RN, regular visits, etc.).
- **Occurrence** = a completed instance of a visit. For recurring visit types (e.g. "regular visits, X per week for X weeks"), one visit produces multiple occurrences.

Worker paths to a visit:
1. **Discover + book** — `GET /api/v1/in-home-cases?filter[booked]=false&...` → `PATCH /api/v1/visits/:id` with `{data:{attributes:{bookedWorkerId}}}`. No invite required.
2. **Invite** — workplace/admin `POST /api/v1/:workplaceId/visits/:id/invites`; worker accepts.

There is **no "book the case" operation** — always per-visit. Some visit types commit the worker to a multi-week cadence, but the data model reflects that via multiple occurrences on the same visit, not a case-level booking.

Worker logs the occurrence on arrival/completion (`POST /api/v1/visits/:visitId/occurrences`). Workplace verifies via `PATCH /api/v1/:workplaceId/visit-occurrences/:id` with `{status: "APPROVED"}` → triggers bonus creation in payment-service (`cbhPayment.service.ts`).

Visit status enum: `OPEN | CANCELED | FILLED | CLOSED | PENDING | CONFIRMED | LOGGED`. Occurrence: `PENDING | APPROVED | REJECTED`.

Ask the user for the exact `$HH_BASE` if it isn't reachable via the gateway — can be on its own subdomain.

## Preferred workers

Owned by `shift-reviews-service` (Postgres, `PreferredWorker` table). Three reasons: `FAVORITE` (workplace user favorited), `RATING` (high rating post-shift, default), `INTERNAL_CRITERIA` (system signal).

Read endpoints: `GET /reviews/preferred-workers`, `/preferred-workers/:workerId/statistics`, `/preferred-workers/:workerId/workplaces`. Upserts authorized via `@AllowClients("backend-main")` — not directly writable with a user token. Matters because `RESTRICTED` workers can only book at preferred workplaces.

## Documents + licenses

Owned by `documents-service-backend`. License fields: `state`, `multiState` (boolean; true = valid in any NLC-member state), `number`, `expiresAt`, `status`. Bookability rule `isLicenseValidForState` validates against the shift's state + NLC + expiry.

Document upload is 3-step: presigned URL → PUT S3 → register via `POST /api/documents`. Admin approves via `PATCH /api/documents/:id`. Requirements are state × qualification specific.

## Attendance-policy scope

`attendance-policy.dev.clipboardstaffing.com`. Owns more than clock windows — also **attendance scores**, **restrictions** (suspensions tied to scores), and **market-level config**. Controllers: `/policies`, `/restrictions`, `/scores` (`/scores/adjust`, `/scores/:id/reversals`), `/workers`, `/workers/:workerUserId/profile`, `/markets`. If you're touching no-show or late-arrival logic, this is the service.

---

# Test data — beyond the core flow

For anything outside the core happy path, use one of:

1. **`core:seed-data` skill** — triggers the `Generate Seed Data` GitHub Action, which creates realistic scenarios (HCPs with Stripe, facilities, shifts, etc.). Preferred for one-off setup at scale.
2. **Admin manual endpoints in `shifts.controller.ts`** — useful for assigning a worker to a shift directly, bypassing bookability.
3. **`cbh-core/packages/testing-e2e-admin-app/src/lib/admin-service.ts`** — the authoritative orchestration reference. Read `createHcpHcfAndShift` for the happy-path orchestration; do NOT import at runtime.

Ask the user which path they prefer before wiring a lot of curl.

# Verification patterns

- **API read-back** — primary. Mutation → GET resource → assert a field changed.
- **Bookability probe** — `GET /api/shifts/:id/state`.
- **Payment truth** — always `payment-service` endpoints, not backend-main (which can be stale).
- **Datadog traces** — service names: `backend-main`, `worker-app-bff`, `payment-service`, `document-service`, `worker-service`, `urgent-shifts`, `shift-reviews-service`, `attendance-policy`, `license-manager`. Hand off to `core:datadog-investigate` for deep dives.
- **Mailpit** — `$MAILPIT_BASE/api/v1/search?query=to:<email>` for signup/login, shift-confirm, cancellation notices, invoice emails.
- **UI sanity check** — `admin-webapp.development.clipboardhealth.org` (serves both employees and facility users) is the last resort for "did this render".

# Troubleshooting by failure mode

- **401 Unauthorized** — token expired (Cognito ID tokens are 5 min) or wrong actor. Regenerate.
- **403 Forbidden** — wrong App Client (`-n` flag), wrong facility-user role (`ADM | SFT | DMT | INV`), or wrong employee permission (e.g. `DELETE_HCP_DATA` needed for admin payout).
- **403 `{"code":"PermissionDenied","detail":"Forbidden resource"}` on shift create** — your admin user has `custom:user_types: EMPLOYEE` (so workplace creation worked) but no `EmployeeProfile` doc. `ShiftCreateAuthorizer` (`shift-create.authorizer.ts:54`) bounces the request without a useful error. Switch to `e2e@clipboardhealth.com` (or another admin known to have an `EmployeeProfile`) and retry.
- **400 "The offered rate for this shift is no longer valid"** on `/api/shifts/claim` — `offerId` is required and must point at a real `shift-offer` (the rate-negotiation guard runs even with `override:true`). Create one first via `POST /api/shifts/:shiftId/offers` (JSON:API body) and pass that `id`. Without this two-step, admin manual-assign always 400s.
- **400 on write** — grep the controller named in the concept's "source" and read the DTO. Payload shapes drift.
- **Stale read** — payment or upcoming-charges state read from backend-main may lag. Read from the owning service (payment-service, shift-reviews-service, documents-service, home-health-api).
- **Async delays** — bonus → upcoming-charges is ~30s via SQS; invoice generation is ~30–60s; Stripe sandbox occasionally blips.
- **"Can't find endpoint"** — grep `clipboard-health/openapi.json` for the path (2.1 MB, grep only — never read in full). Or grep `@Controller`, `@Post`, `@Patch` in the owning service.

# Browser fallback (Mailpit magic-link)

Use only when no API exists (the login form itself; visual-only changes; phone-OTP-gated worker signup).

1. Navigate to `admin-webapp.development.clipboardhealth.org` (employees and facility users) or `hcp-webapp.development.clipboardhealth.org` (workers).
2. Enter email → trigger magic-link.
3. Poll Mailpit: `GET $MAILPIT_BASE/api/v1/search?query=to:<email>`.
4. Extract link from `.HTML` / `.Text` of the latest message; navigate to it.

Don't try to inject Cognito `localStorage` values — the magic-link flow is simpler. Worker signup may require an OTP autofill key (`REACT_APP_TEST_HELPER_API_KEY`, 1Password → Shared Engineering) in dev.

# Out-of-scope for v1

- Non-`development` environments.
- Mobile-native automation (iOS/Android app binaries).
- Legacy Flutter facility app.
- Load / performance testing.
- Deep Cognito lifecycle repair → `core:cognito-user-analysis`.
- Production incident investigation → `core:datadog-investigate`.
- CI debugging → `core:fix-ci`.
- Direct Stripe sandbox fixtures — if Stripe is misbehaving, ask the user.
- Other verticals beyond healthcare (education, etc.) — ask the user for repo/domain pointers when relevant.

# Reference appendix — files to open for current truth

Ordered by how often you'll open them:

- `clipboard-health/src/modules/shifts/controllers/shifts.controller.ts` — legacy: `/api/shifts/claim` (worker self-claim AND admin-assign), `/api/shifts/unassign`, `/api/shift/put` (legacy update), `/api/shift/create`. Note path inconsistency: create+put are under `/api/shift/` (singular), most reads under `/api/shifts/`. Mounted with `@Controller(["/api/shifts","/api/shift"])` so both prefixes match.
- `clipboard-health/src/modules/shifts/entrypoints/shift-create.controller.ts` — **v3** `POST /api/v3/shifts` (JSON:API), the documented replacement for the legacy create. Goes through the same `ShiftCreateAuthorizer`.
- `clipboard-health/src/modules/shifts/entrypoints/internal/shift-create.authorizer.ts` — the gate behind generic 403 *"Permission to resource denied"* when an admin lacks an `EmployeeProfile`.
- `clipboard-health/src/modules/shifts/services/adminShiftAssign.service.ts` — `adminShiftAssign` method; the bookability decisions and `getAdminShiftAssignResponseWithSideEffects` map non-bookable criteria to errors.
- `clipboard-health/src/modules/shift-offers/admin-shift-offer.controller.ts` + `claim-shift-offer.service.ts` — `POST /api/shifts/:id/offers` (must be created before /claim, even with `override:true`).
- `clipboard-health/packages/contract-backend-main/src/lib/shifts.contract.ts` — `shiftCreateBodySchema` (flat, legacy), `shiftClaimBodySchema` (`offerId` required), `shiftUpdteInfoSchema` (sic), `shiftAdjustmentSchema` (`adjustmentType` enum: `preInvoicePreference|preInvoiceDispute|postInvoiceDispute|other`).
- `clipboard-health/node_modules/@clipboard-health/contract-backend-main/src/lib/shiftV3.contract.ts` — v3 `shiftContract.create` body (`createShiftDto` JSON:API shape from `shiftCreate.contract.ts`).
- `clipboard-health/node_modules/@clipboard-health/contract-backend-main/src/lib/workerLeftEarlyRequests.contract.ts` — left-early body and response schemas (JSON:API).
- `clipboard-health/src/modules/worker-left-early/entrypoints/worker-left-early.controller.ts` — left-early create + read endpoints.
- `clipboard-health/packages/contract-backend-main/src/lib/shiftOffers.contract.ts` — offer create body shape.
- `clipboard-health/src/modules/shifts/rules/bookability/constants/constants.ts` — bookability rules.
- `clipboard-health/src/modules/shift-timekeeping/timekeeping-actions/controllers/shift-time-keeping-action-v2.controller.ts` — clock in/out (admin path uses `startOfMinute(new Date())`, ignoring body's `shiftActionTime`).
- `clipboard-health/src/modules/facilityProfile/services/middlewares/createFacilityProfileValidator.middleware.ts` — workplace required-field list and `salesforceID` regex.
- `clipboard-health/src/modules/user/controllers/user.controller.ts` — `/api/user/create` (worker-create), `/api/user/getByEmail`, `/api/user/agentSearch?searchInput=<email>` (find existing worker by email — returns both `_id` (agentProfile) and `userId`; for shift `agentId` use `userId`).
- `clipboard-health/src/modules/user/services/user-manipulation.service.ts → createAgent` — creates agentProfile + Cognito user in one call (no Mailpit pre-signup needed).
- `clipboard-health/packages/contract-backend-main/src/lib/user.contract.ts → createUserRequestSchema` — body shape.
- `clipboard-health/packages/contract-backend-main/src/lib/agentProfile.contract.ts → updateWorkerRequestSchema` — `PUT /api/agentprofile/put` (used to set `qualification`, `licensedStates`, etc).
- `clipboard-health/src/modules/shifts-invites/shift-invite.controller.ts` — shift invites.
- `clipboard-health/src/modules/shift-blocks/controllers/{shift-blocks, booking-requests}.controller.ts` — shift blocks.
- `clipboard-health/src/modules/payment/controllers/payment-invoice.controller.ts` — invoice generation (`POST /api/payment/sendInvoices`).
- `clipboard-health/src/modules/payment/helpers/payment-invoice.helper.ts → getFacilityByInvoiceSegments` — explains the `selectedIdsMap` keyed-by-segment-type structure.
- `clipboard-health/src/modules/invoice/services/invoice-segments.service.ts` — `segmentTypes` constants (`invoices-without-errors|invoices-with-errors|not-generated|not-generated-with-errors`).
- `clipboard-health/src/modules/invoice/repositories/invoice-segments.repository.ts` — Mongo match conditions for billable shifts (`agentId: $exists+$ne null`, etc).
- `clipboard-health/packages/contract-backend-main/src/lib/paymentInvoice.contract.ts` — `sendInvoicesBodySchema`, segment list query schema.
- `clipboard-health/src/models/shiftCancellationReason.type.ts` — cancellation reasons enum.
- `clipboard-health/src/workers/constants/workerStages/index.ts` — worker stages enum.
- `clipboard-health/src/services/urgentShifts/constants.ts` — urgency tier/reason enums.
- `clipboard-health/openapi.json` — full spec (grep only, 2.1 MB).
- `payment-service/src/app/payments/transfers/accounts-transfers.controller.ts` — transfers.
- `payment-service/src/app/accounts/accounts.controller.ts` — account reads.
- `payment-service/src/app/payouts/payouts.controller.ts` — payouts.
- `payment-service/src/app/bonuses/bonuses.service.ts` — bonus entity and `createBonusPayment`.
- `home-health-api/src/modules/cases/cases.worker.controller.ts` — worker browse.
- `home-health-api/src/modules/visits/visits.{worker,workplace}.controller.ts` — visit endpoints.
- `home-health-api/src/modules/visits-occurrences/visitsOccurrences.workplace.controller.ts` — occurrence approval.
- `home-health-api/prisma/schema.prisma` — visit/occurrence status enums.
- `documents-service-backend/src/app/rest-api/controllers/hcp-documents.controller.ts` — documents.
- `documents-service-backend/src/app/rest-api/licenses/dtos/license-data.dto.ts` — license schema.
- `shift-reviews-service/src/...` — preferred workers.
- `attendance-policy/src/...` — attendance policies/scores/restrictions.
- `cbh-core/packages/cli/src/oclif/auth/gentoken.ts` — CLI token flow.
- `cbh-core/packages/testing-e2e-admin-app/src/lib/constants.ts` — **reference payloads** (`DEFAULT_*` bodies).
- `cbh-core/packages/testing-e2e-admin-app/src/lib/admin-service.ts` — `AdminService` orchestration reference.
- `cbh-core/packages/testing-e2e-admin-app/src/lib/service-urls.ts` — env → URL map.

If any path 404s on your machine, ask the user for the correct location — repos may be under a different root.
