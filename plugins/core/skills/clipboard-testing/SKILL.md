---
name: clipboard-testing
description: End-to-end testing playbook for Clipboard Health changes. Use when the user wants to verify, exercise, or set up test data for a backend or frontend change against a live environment — "test my change end-to-end", "verify this works in dev", "create a test workplace / worker / shift", "get a shift through to paid / invoiced", "prove the API change works". Defaults to the `development` AWS environment, API-first (cbh CLI tokens + curl). The skill knows enough to run the core happy-path flow (workplace → worker → shift → clock in/out → pay → invoice) autonomously; for anything else, it orients around the codebase and asks the user for missing directories.
allowed-tools: Bash, Read, Grep, Glob
---

# Clipboard Testing

This skill lets you verify Clipboard Health changes end-to-end against `development`. It is opinionated about two things:

- **API-first.** curl against the dev gateway with tokens from `cbh auth gentoken`. No packages to install.
- **Concepts over memorized payloads.** Field shapes and validation rules change. The skill teaches you _what owns what_ and _where to read current truth_ — not a fixed cookbook.

The one area where the skill carries enough detail to run alone is the **core happy-path flow** (create workplace → create worker → create shift → book → clock in/out → trigger pay → generate invoice). Everything else is concept + controller pointer + "read the file before you call it".

## Hard guardrails

`development` only. The recipes here mint S2S tokens, create Cognito users, and move test-mode money — running them in any other environment is out of scope and can have real consequences.

1. **Env literal must be `development`.** If the user asks for `staging`, `prod-shadow`, `prod-recreated`, `production`, or any other env, refuse and stop. Pin in scripts:

   ```bash
   ENV=development
   [ "$ENV" = "development" ] || { echo "REFUSE: dev-only" >&2; exit 1; }
   ```

2. **HTTPS host allowlist.** Every curl or browser request must match one of:
   - `*.development.clipboardhealth.org` (gateway + admin-webapp + hcp-webapp + home-health-api)
   - `mailpit.tools.cbh.rocks`
   - `sandbox.invoiced.com` (Invoiced.com sandbox)

   ```bash
   case "$URL" in
     https://*.development.clipboardhealth.org/*|https://mailpit.tools.cbh.rocks/*|https://sandbox.invoiced.com/*) ;;
     *) echo "REFUSE: URL outside dev allowlist: $URL" >&2; exit 1 ;;
   esac
   ```

3. **S2S tokens are dev-only.** `cbh auth gentoken client <env> <service>` bypasses user auth — a `payment-service` token can move real money. Hard-code `development` in the call; never parameterize the env across envs.

4. **Mailpit links.** The trusted sender in dev is `no-reply+dev@updates.clipboardworks.com`. Filter on that `from:` AND verify the link host against rule 2 before navigating. Untrusted senders can plant lookalike magic-links into the shared mailbox.

5. **Token output.** Don't paste tokens or full decoded JWT payloads into chat; pipe JWT decode through `jq` to project only the claims you need.

6. **Privileged primitives** — confirm IDs before invoking, even in dev: `POST /api/user/create`, `POST /payment/accounts` (with `gatewayAccountCreationIsEnabled: false`), `POST /payment/accounts/:agentId/transfers`, `POST /payment/sendInvoices`. Use throwaway emails like `+test-<timestamp>@clipboardhealth.com` for user creation.

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

| Repo                                       | What lives there                                                                                                                                                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clipboard-health/`                        | **Main backend monolith (aka backend-main).** Shifts, workers (HCP), workplaces (facilities), invites, shift blocks, bookability rules, invoicing triggers. Mongo.                                               |
| `payment-service/`                         | Payments + bonuses. Transfers (Clipboard Stripe → worker Express), payouts (Express → external), bonus entities, external payment accounts, payment blockers. **Own Mongo — source of truth for payment state.** |
| `home-health-api/`                         | Home Health product: cases, visits (typed), visit occurrences. **Postgres.** Standalone NestJS. Not behind the gateway.                                                                                          |
| `documents-service-backend/`               | Documents (presigned uploads, approval) and licenses (incl. NLC `multiState` flag). Own deployment + Datadog service (`document-service`).                                                                       |
| `shift-reviews-service/`                   | Post-shift ratings + **preferred workers** (reasons: `FAVORITE`, `RATING`, `INTERNAL_CRITERIA`). Postgres.                                                                                                       |
| `attendance-policy/`                       | Clock-in windows **plus** attendance scores, score adjustments, restrictions, market-level config. Controllers: `/policies`, `/restrictions`, `/scores`, `/workers`, `/markets`.                                 |
| `urgent-shifts/`                           | **Archived** — repo is read-only. Urgency-tier constants (`NCNS`, `LATE_CANCELLATION`, `LAST_MINUTE`) now live in `clipboard-health/src/services/urgentShifts/`.                                                 |
| `worker-app-bff/`                          | Worker-facing BFF. **Read-only / proxy** for most domain data. Don't send writes here.                                                                                                                           |
| `worker-service-backend/`                  | Worker-service endpoints (worker-side reads and some writes).                                                                                                                                                    |
| `cbh-api-gateway/`                         | API gateway config — routes `/api`, `/payment`, `/worker`, `/license-manager`, `/reviews`, etc.                                                                                                                  |
| `license-manager/`                         | License lifecycle + state sync (backing the documents license flow).                                                                                                                                             |
| `cbh-backend-notifications/`               | Notification dispatch (push, email, SMS).                                                                                                                                                                        |
| `cbh-chat-service/`                        | In-app chat between workers and workplaces.                                                                                                                                                                      |
| `cbh-admin-frontend/`                      | **admin-webapp** — serves both **CBH employees** and **facility users** (mobile-friendly). UI branches on who's logged in.                                                                                       |
| `admin-app/`                               | Legacy admin frontend (being superseded by `cbh-admin-frontend`). Check this only if something is missing above.                                                                                                 |
| `cbh-mobile-app/`                          | Worker mobile app (Ionic + native). Also exposes a dev PWA at `hcp-webapp.development.clipboardhealth.org`.                                                                                                      |
| `clipboard-facility-app/`                  | Legacy Flutter facility app (being phased out; replaced by `admin-webapp`). Usually don't need this.                                                                                                             |
| `cbh-core/packages/cli/`                   | The `cbh` CLI — `auth gentoken`, `seed-data`, `local-package`, `dev up`.                                                                                                                                         |
| `cbh-core/packages/testing-e2e-admin-app/` | Canonical **reference payloads** and **AdminService method shapes** — read but do not import at runtime; shapes can be stale.                                                                                    |
| `cbh-infrastructure/`                      | Terraform. URLs, Cognito pools, SES/Mailpit, network firewalls.                                                                                                                                                  |

**Long-tail repos** that might be relevant for specific features — `open-shifts/`, `shift-verification/`, `pricing-service/`, `cbh-location-service/`, `authentication/`, `cbh-evidence/`, `invite-generator/`. Ask the user which domain a change touches before guessing.

If any of these aren't present in `$CBH_ROOT`, ask the user.

## Actors, tokens, apps

Three human Cognito App Clients + one impersonation variant + S2S.

| clientName                | Actor                       | App surface                                                                                    |
| ------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------- |
| `admin-app`               | CBH employee                | `admin-webapp.development.clipboardhealth.org` (also serves facility users)                    |
| `worker-app`              | Worker (HCP)                | `hcp-webapp.development.clipboardhealth.org` + native mobile                                   |
| `workplace-app`           | Facility user (legacy)      | Flutter app being phased out. New facility users log into `admin-webapp` via `admin-app` flow. |
| `worker-app-impersonated` | Employee acting as a worker | admin-webapp impersonation mode                                                                |

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

All dev signup and login emails land in **Mailpit** at `https://mailpit.tools.cbh.rocks/` (basic-auth; creds in 1Password). Trusted sender: `no-reply+dev@updates.clipboardworks.com`. Useful subjects: `"Your Clipboard sign-in link"` (magic link), `"Your Clipboard login code"` (OTP for phone-aliased emails like `<10-digits>.phone.email@testmail.com`), `"Your <workplace name> Shift is Booked!"`, `"... was cancelled by the workplace."`.

**`USER_TYPE_NOT_ALLOWED` minting cross-type tokens** — `cbh auth gentoken user … -n worker-app` (or `-n workplace-app`) for an EMPLOYEE-typed Cognito user returns `Error initiating custom challenge MAKE_TEST_TOKEN: DefineAuthChallenge failed with error USER_TYPE_NOT_ALLOWED`. You can't reuse your admin email as a worker or workplace-user; create a dedicated account for that role.

## Environment reference — `development` only

| Service              | Base URL / mount                                                                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API gateway          | `https://apigateway.development.clipboardhealth.org` (`$API_BASE`)                                                                                                                 |
| backend-main         | `$API_BASE/api`                                                                                                                                                                    |
| payment-service      | `$API_BASE/payment`                                                                                                                                                                |
| worker-service       | `$API_BASE/worker`                                                                                                                                                                 |
| license-manager      | `$API_BASE/license-manager`                                                                                                                                                        |
| documents (REST)     | `$API_BASE/api/documents`                                                                                                                                                          |
| documents (GraphQL)  | `$API_BASE/docs/graphql`                                                                                                                                                           |
| shift-reviews        | `$API_BASE/reviews`                                                                                                                                                                |
| attendance-policy    | `$API_BASE/attendance-policy/` (gateway-rewritten in dev)                                                                                                                          |
| home-health-api      | `$API_BASE/home-health-api` (gateway-rewritten). Controllers mount both `/api/v1/...` and `/home-health-api/api/v1/...`; through the gateway, use the `/home-health-api/...` form. |
| Invoiced.com sandbox | `https://sandbox.invoiced.com` (fully stubbed in dev)                                                                                                                              |
| Mailpit              | `https://mailpit.tools.cbh.rocks`                                                                                                                                                  |
| Admin webapp         | `https://admin-webapp.development.clipboardhealth.org`                                                                                                                             |
| Worker PWA           | `https://hcp-webapp.development.clipboardhealth.org`                                                                                                                               |

## Prerequisites

```bash
# Current cbh CLI
cbh --version   # expect 8.x
# upgrade: npm install --global @clipboard-health/cli@latest

# Dev VPN — required for direct development MongoDB access; gateway and Mailpit are reachable without it

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
export ADMIN_WEBAPP=https://admin-webapp.development.clipboardhealth.org

# Admin (CBH employee) — used for most setup writes
export ADMIN_EMAIL=<ask user>
export ADMIN_TOKEN=$(cbh auth gentoken user development "$ADMIN_EMAIL" -q)

# Service-to-service — used for payment-service writes initiated from backend-main
export S2S_BACKEND_MAIN=$(cbh auth gentoken client development backend-main -q)

# Admin userId — claim on the token, no API call needed
PAYLOAD=$(echo "$ADMIN_TOKEN" | cut -d. -f2); LEN=$(( ${#PAYLOAD} % 4 ))
[ $LEN -ne 0 ] && PAYLOAD="$PAYLOAD$(printf '=%.0s' $(seq 1 $((4-LEN))))"
export ADMIN_USERID=$(echo "$PAYLOAD" | tr '_-' '/+' | { base64 -d 2>/dev/null || base64 -D; } | jq -r '."custom:cbh_user_id"')
```

The worker token is minted **after** Step 2 (see Step 5). `POST /api/user/create` creates the Cognito user as a side effect, so no hcp-webapp signup + Mailpit dance is needed.

`ADMIN_USERID` is used as `addedBy` / `sessionUser` / `adminId` in many downstream calls (the `constants.ts` default is stale). The token-claim path above is preferred — if you ever need an API fallback, hit `GET /api/user/getByEmail?email=…` (URL-encoded) with `$ADMIN_TOKEN`.

**Pick an admin with an `EmployeeProfile` doc.** The plain `@AllowClipboardHealthEmployees()` decorator passes for any JWT with `custom:user_types: EMPLOYEE` (so workplace creation works for almost any CBH email). But `ShiftCreateAuthorizer` (`src/modules/shifts/entrypoints/internal/shift-create.authorizer.ts:54`) additionally requires an `EmployeeProfile` keyed by your `userId`, and many real CBH dev users don't have one. Symptom: shift create returns generic `403 {"code":"PermissionDenied","detail":"Forbidden resource"}` with no detail. **Default to `e2e@clipboardhealth.com` for shift writes** unless the user explicitly hands you another admin email and confirms it has an EmployeeProfile.

**Invoice-only fast path:** if all the user wants is a billable shift to invoice (no real money flow, no Stripe, no payouts), you can skip Steps 4 (Stripe), 5 (worker token isn't needed), and 9 (transfer/payout). Minimum chain: Step 1 → 2 → 3 → 6 → 7 → "test-data shortcut" in Step 8 (`PUT /api/shift/put` with `verified:true`) → re-run Step 7 if `agentId` got cleared → Step 10 with `includeUnverifiedInErrors:true` and segment `not-generated-with-errors`.

## Step 1 — Create a workplace (LTC)

Validator at `clipboard-health/src/modules/facilityProfile/services/middlewares/createFacilityProfileValidator.middleware.ts`. Required: `rushFee`, `lateCancellation`, `netTerms`, `disputeTerms`, `ratesTable`, `holidayFee`, `sentHomeChargeHours`, plus a rate entry for **every** qualification enabled for the workplace type (the validator iterates qualifications and `check("rates.{q}").exists()` — missing rate keys are reported as `"Invalid rate - X doesn't exist"`, which means _missing_, not _unrecognized_). For LTC today that's also: `NP`, `QMAP`, `Server`, `Janitor`, `Site Lead`, `Medical Aide`, `Medical Technician`, `Respiratory Therapist`, `Dental Hygienist`, `Dental Assistant`, `CNA On Call`. **`salesforceID` regex: exactly 15 or 18 alphanumeric chars** (`/^[0-9a-zA-Z]{15}([0-9a-zA-Z]{3})?$/`). Response uses `id`, not `_id`.

**1099 coverage testing**: if your test needs 1099 policy coverage, the workplace must be in `CA / FL / MI / NJ` (the four convalescent-home states with the doc-requirement feature flag enabled) and you'll then `POST /api/workplaces/:workplaceId/1099-policy/entities` separately — see the "1099 Policy coverage" concept section.

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

**Alternative — `POST /api/testHelpers/createUser`** (`src/tests/helpers/api/testHelpers/controller.ts:785`, dev-only via `meta().dev`). Same `userManipulationService.createAgent` underneath, so it produces an equivalent `agentProfile` + Cognito user. Use it when you don't have an admin Cognito user handy: auth is the literal `TEST_HELPER_API_KEY` shared secret as the `Authorization` header (no `Bearer` re-wrapping — pass it verbatim), sourced from 1Password vault **"Engineering - Shared"** → item `REACT_APP_TEST_HELPER_API_KEY`. The value lives in the item's `notesPlain` field (not `password`); strip the `REACT_APP_TEST_HELPER_API_KEY=` prefix and pass the remaining `Bearer …` string as the `Authorization` header. Body shape is the `CreateUserBody` interface in the same controller file (looser than `/api/user/create`'s contract).

`ADMIN_USERID` is already exported from Setup. (Used as `addedBy` and `sessionUser` here — the constants.ts default `60841c3970071101613e1c50` is stale.)

Then:

```bash
export WORKER_EMAIL=invoice-test-$(date +%s)@clipboardhealth.com
PHONE=$(printf "415555%04d" $((RANDOM % 10000)))
REFCODE=$(LC_ALL=C tr -dc A-Z0-9 < /dev/urandom | head -c 8)
# Paste the full encrypted SSN blob from:
# cbh-core/packages/testing-e2e-admin-app/src/lib/constants.ts (DEFAULT_CREATE_HCP_REQUEST_BODY.fullSocialSecurityNumber)
SSN_BLOB='<paste full blob here>'

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

## Step 4 — Connect Stripe (or skip it explicitly)

Two choices in dev. **Ask the user which they want** before proceeding. Either is fine for most flows; pick based on whether you need to exercise transfers/payouts.

**Option A (default for non-payout flows): bypass Stripe with `gatewayAccountCreationIsEnabled: false`.**

`POST /payment/accounts` with the bypass flag creates the `Account` doc directly with `status: "Instant Payouts Enabled"` and `enabled: true` — no Stripe call, no Express onboarding. Bonus creation works against it; transfers and payouts will fail downstream because there's no real Stripe account behind it. Mongoose validation still requires a non-empty `accountId`, so pass any synthetic value.

The `allowWorkerToCreateAccount` authorizer requires `principal.userId === bodyData.agentId`, so call this **as the worker** (uses `$WORKER_TOKEN` from Step 5 — mint it first if you haven't):

```bash
curl -sS -X POST "$API_BASE/payment/accounts" \
  -H "Authorization: Bearer $WORKER_TOKEN" -H "Content-Type: application/json" \
  -d "{\"agentId\":\"$WORKER_USERID\",\"email\":\"$WORKER_EMAIL\",\"gatewayAccountCreationIsEnabled\":false,\"accountId\":\"acct_test_$WORKER_USERID\"}" | jq
```

**Option B: real Stripe Express onboarding (needed if you're testing transfers/payouts).**

Call `POST /payment/accounts` _without_ the bypass flag (creates a real Stripe Express account in the sandbox), then `POST /payment/accounts/:id/generate-express-account-link` with `{ "returnUrl": "<any-https>" }`. Surface the returned URL to the user — they complete Express onboarding in the browser (you cannot fill the Stripe-hosted form on their behalf). Once they're back, retry the original flow.

Reference: `AdminService.createPaymentAccountForHcp` in `cbh-core/packages/testing-e2e-admin-app/src/lib/admin-service.ts` is the canonical orchestration; `payment-service/src/app/accounts/accounts.controller.ts:204,360` for the create + link-generation endpoints.

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

Live worker path (use this for "real" booking flows in a _future_ shift window):

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
  "appUrl": "$ADMIN_WEBAPP",
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

**Worker mobile-app earnings/bookings tabs filter on two things admin-webapp ignores:** worker stage (`ONBOARDING` → empty state) and `shift.start < now` (future-dated shifts hidden, even verified + paid). So a shift can be paid in payment-service and still missing from Earnings. To make a verified shift visible there, its `start` / `end` must already be in the past at verify time — see the PUT-on-verified-shift gotcha in Troubleshooting.

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

```ts
isBillable =
  leadTime < facility.lateCancellation.period &&
  facility.lateCancellation.feeHours !== 0 &&
  !isWorkerLateBeyondThreshold && // >20min late
  !hasInvalidPayoutValues;
```

No reason code exempts the workplace by itself. Escape hatches: outside late-cancel window, `feeHours=0`, worker very late.

Paths:

- Worker cancel — `POST /api/shifts/worker-cancel-request` (reasons: `SICK`, `TRANSPORTATION`, `BABYSITTER_ISSUE`, …).
- Facility cancel (two-step) — `PATCH /api/shifts/:id/facility-cancelled-me/request` → `.../approve` (or `.../reject`). Reasons: `LOW_CENSUS`, `STAFFED_IN_HOUSE`, `STAFFED_OTHER_REGISTRY`, `NO_CALL_NO_SHOW`, `FACILITY_USER_SUBMIT_SENT_HOME`, `WORKER_IS_LATE`, `OTHER`.
- Sent home (mid-shift) — routed through the same facility-cancel flow with `FACILITY_USER_SUBMIT_SENT_HOME`; separate `getSentHomePayoutParams` computes partial pay.
- Left early (recorded _about_ a worker, **not** filed _by_ one) — `POST /api/worker-left-early-requests`. Body is **JSON:API** with `type: "worker-left-early-request"` and attributes `{shiftId, replacementRequested, leftWithPermission, comment}`. Contract: `node_modules/@clipboard-health/contract-backend-main/src/lib/workerLeftEarlyRequests.contract.ts`. Controller: `src/modules/worker-left-early/entrypoints/worker-left-early.controller.ts`. The route's decorator is `@AllowAnyAuthenticatedUser`, **but** `WorkerLeftEarlyAuthorizer` only accepts: (1) `EMPLOYEE` with an `EmployeeProfile`, or (2) `WORKPLACE_USER` who `worksAt(facilityId)`, is verified+non-suspicious, AND has role `ADMIN | SHIFT_MANAGEMENT | DOCUMENTS` or the `POST_SHIFT_PERMISSION` permission. **Worker tokens get 403 "Unauthorized user".** Use the admin (e2e) token or a facility-user token. Returns the request with optional `replacementShiftId` if `replacementRequested:true`. Read-back: `GET /api/worker-left-early-requests/:id?include[]=shift&include[]=worker` (path param is the WLE request id, not the shift id, despite the contract's `ShiftIdSchema` typing).
- Admin delete — `POST /api/shift/:id/delete` with `ADMIN_EDIT_SHIFT | ADMIN_MIGRATION`.

Always dry-run with `GET /api/shifts/:id/cancellationParams` before asserting `isBillable` / `isPayable`.

## Bonuses — the entity lives in payment-service

Initiated from backend-main for many reasons (shift completion bonuses, sent-home fees, cancellation fees, **Home Health occurrence payouts**, discretionary admin bonuses). worker-app-bff is read-only.

DTO at `payment-service/src/app/bonuses/bonuses.dtos.ts → CreateBonusPaymentDto`. Schema fields that matter:

- `amount` (paid to worker), `charge` (billed to workplace; `0` or `null` = no charge), `billable` (default `true`; `false` skips from upcoming charges).
- `facilityId`, `agentId`, `shiftId`, `reason`, `status`. **No `chargesFacility` field.**
- **`description` vs `invoiceLine` are two distinct fields with two audiences.** `description` is the worker-facing string (used in transfer descriptors etc.). `invoiceLine` is the workplace-invoice line item label and is what `buildBonusLineItem` writes to `lineItem.description` on the upcoming-charges record. Setting only `description` does **not** put the string on the workplace invoice. See `clipboard-health/src/modules/upcoming-charges/services/upcomingChargesUpdateBonus.job.ts → buildBonusLineItem`.
- `type` literal values are dotted: `TBIO.SINGLE | TBIO.BACK_TO_BACK | TBIO.OVER_FORTY | HOME_HEALTH` — these are the enum _values_ in `BonusesPayment/types.ts`. Producer code uses `BonusPaymentType.single` (the enum _key_) but on the wire the string is `"TBIO.SINGLE"`. Sending `"single"` returns 500 with a Mongoose enum validation error.
- `createdBy` must be a Mongo ObjectId (the service does `new Types.ObjectId(createdBy)` and 500s on bad input). **Ask the user for a userId if you don't have one; otherwise fall back to the current admin's `custom:cbh_user_id` claim from the admin token.** Or omit the field — it's optional.
- **`agentId` is the worker's `userId`, NOT the agentProfile `_id`.** Grab `userId` from the `/api/user/create` response (or `/api/user/agentSearch` lookup) and pass that everywhere payment-service expects an agentId. Account doc `_id` is `Types.ObjectId(agentId)`, so `accounts.findById(agentId)` matches by `_id === userId`.

Reversal: `POST /api/bonus-payments/:id/reversals`.

Upcoming-charges integration is async: `BonusPaymentCreated` SQS → consumer → job inserts if `charge > 0 && billable !== false`, removes if `charge === 0`. Wait ~30s between bonus creation and checking upcoming charges.

To inspect the resulting line item, call `GET $API_BASE/api/upcoming-charges?facilityId=<workplaceId>&periodStartDate=<...>&periodEndDate=<...>` (admin token). The record is keyed by **Sunday-aligned week** (`moment.utc(payPeriodStart).startOf("week")`), so query a range that covers the whole week containing your bonus's `payPeriodStart`. If the response is `[]`, widen to Sunday-of-week → Saturday-end-of-week. The relevant line item shows up under `[0].otherCharges[]` with `bonusId` matching what you sent and `description` matching the `invoiceLine` you sent.

## 1099 Policy coverage

"1099 coverage" is workers' comp / GL insurance issued by **1099Policy.com** for individual contractors per shift. Two-sided opt-in: workplace registers as a contracting entity, worker walks the application + binds a policy. Per shift, an _assignment_ is created tying the worker's policy to a specific job.

**Three IDs to keep straight (all returned by 1099Policy):**

- `ten99PolicyEntityId` (`en_*`) on the workplace.
- `ten99PolicyContractorId` (`cn_*`) on the worker.
- `ten99PolicyAssignmentId` (`an_*`) per shift+worker, plus a `ten99PolicyJobId` (`jb_*`) wrapping it.

**Workplace setup (CBH employee).** `POST /api/workplaces/:workplaceId/1099-policy/entities` with `{data:{type:"ten99-policy-entity",attributes:{categoryCode},relationships:{workplace}}}`. Read config via `GET /api/workplaces/:workplaceId/1099-policy/configuration` — `stateOnboarded:true` + a `documentRequirementId` means the LD flag has the workers'-comp doc requirement enabled for that workplace's state. Eligible states only: **CA, FL, MI, NJ** (per `TEN99_POLICY_CONVALESCENT_HOME_STATES` in `ten99-policy.constants.ts`).

**Worker setup (worker token).** `POST /api/1099-policy/application-sessions` returns a `url` like `https://apply.1099policy.com/sandbox/ias_*` — **must be walked in a browser** to bind a policy. Internally, our system creates a `Ten99PolicyJob` row with `ten99PolicySessionId`. After the user walks the sandbox UI to "You've successfully signed up for coverage", 1099Policy fires `application.complete` (and later `policy.active`) back to `POST /api/1099-policy/events`. Without walking through to policy binding, downstream assignment creation 400s.

**Per-shift assignment (worker token).** `POST /api/1099-policy/assignments` with `{data:{type:"ten99-policy-assignment",relationships:{shift,worker}}}`. Returns `netRate` (cents per $100 earned, e.g. `572` = 5.72%). The assignment's `effective_date` (the shift's `start`) **must be in the future** at request time — past-window shifts always 400. Workflow: create the assignment while the shift is still future, then `PUT /api/shift/put` to fast-forward `time` / `clockInOut` / `verified`.

**Fee math.** `getTen99PolicyAssignmentFeeInCents` (called from `triggerShiftPayment`) computes `feeInCents = round((basePayInCents × time / 100 / 100) × netRate)`. Records it on the shift document and on the `Ten99PolicyJob` row. Read the recorded value via `GET /api/shifts/:shiftId/1099-policy/assignments` — that endpoint surfaces `assignmentFeeInCents`. The `/api/workers/:workerId/1099-policy/jobs` endpoint **does not** surface the fee field (DTO mapper at `ten99-policy.dto.mapper.ts:135-175` omits it).

**Deduction from worker pay is `TIMESHEET_UPLOAD`-only.** Per `shift-payment.domain.ts:120-168` and the explicit assertion at `shift-payment.domain.spec.ts:199-225` (VAU-1106): the fee is **only subtracted** from the payable amount on `PAYMENT_EVENTS.TIMESHEET_UPLOAD` and `RETRY_MISSING_PAYMENT_TIMESHEET_UPLOAD`. On `SHIFT_VERIFICATION` / `SHIFT_SENT_HOME` / `SHIFT_MISSED_PUNCH_REQUEST_APPROVAL` the fee is recorded but the worker gets full pay; the fee is recovered through the 1099Policy invoice that gets enqueued via `CREATE_TEN99_POLICY_INVOICE_FOR_ASSIGNMENT_JOB_NAME`. So if you're testing "fee deducted from worker pay," you need a manual-timekeeping flow ending in `PUT /api/v2/shifts/timecard/:shiftId` + admin approval, not a regular admin verify.

**Hidden prereq: `TIMESHEET_UPLOAD` deduction needs an `InstantPayShift` row.** `doInstantPay` (`helpers/instantPay.ts:847`) short-circuits when `getInstantShift(shiftId)` returns null. That row is created by the worker self-clock-in flow (`POST /api/shifts/record_timekeeping_action/:shiftId` with `stage: CLOCK_IN`) — **not** by admin-override claim. With admin-claimed shifts the timecard endpoint auto-verifies and surfaces the fee (`ten99PolicyAssignmentFeeInCents`), but no Stripe transfer with the deduction fires — the hourly retry-missing-payment cron eventually transfers the **full** gross via SHIFT_VERIFICATION instead. To prove the deduction at the Stripe level, the worker must self-clock-in (requires a valid background check on file).

## Home Health — Case → Visit → Occurrence

Separate backend (`home-health-api`, Postgres), same mobile and admin apps. Reach it through the gateway at `$API_BASE/home-health-api/api/v1/...`.

- **Case** = a patient owned by a Home Health agency workplace.
- **Visit** = a scheduled appointment, **typed** (e.g. admission visit which must be done by an RN, regular visits, etc.).
- **Occurrence** = a completed instance of a visit. For recurring visit types (e.g. "regular visits, X per week for X weeks"), one visit produces multiple occurrences.

**Workplace identity gotcha — `workplaceId` is the workplace User.\_id, NOT the FacilityProfile.\_id.** `POST /api/facilityprofile/create` returns top-level `id: <facilityProfile.userId>` (`facilityProfile.service.ts:456`). That's the value HH-API expects in URL paths (`workplaceId: workplace.userId` in `visits.service.ts`). `GET /api/facilityprofile/:id` returns a different `_id` (the FacilityProfile doc's). Use the create-response `id`.

Workplace type for Home Health is **`"Home Healthcare"`** (mapped to `TypeOfCare.HOME_HEALTH` in `cbh-core/utils.ts → stringTypeOfCareToEnum`). Only 4 qualifications enabled: `CAREGIVER, RN, CNA, LVN` — no other rates needed in the workplace `rates` map.

**Visit creation requires account-pricing to exist first.** `visits.service.ts → ensurePricingExistsForVisit` looks up the tuple `(workplaceId, agentReq, visitType, pricingType, typeOfCare)` in `AccountPricing` (Prisma `@@unique unique_charge_rate_combination`). Missing row → throws `"Account pricing for visit type does not exist"`, which surfaces as a 500 from the visit-create endpoint. The `agentReq` part of the tuple is server-coerced to `RN` for `RN_VISIT_TYPES` (`ADMISSION`, `ADMISSION_AND_FIRST_VISIT`, `EVALUATION`, `RECERTIFICATION`, `RESUMPTION_OF_CARE`, `NURSING_EVAL`); for `REGULAR`, `DISCHARGE`, `SUPERVISORY` it uses the request's `workerReq` verbatim. Seed accordingly.

**Seeding via API** — `POST /home-health-api/api/v1/:workplaceId/account-pricing` (`AccountPricingController`, `@AllowClipboardHealthEmployees()`):

```json
{
  "data": {
    "type": "accountPricing",
    "attributes": {
      "visitType": "REGULAR",
      "agentReq": "CNA",
      "payRateInMinorUnits": 5500,
      "chargeRateInMinorUnits": 7500,
      "pricingType": "PER_VISIT",
      "typeOfCare": "HOME_HEALTH"
    }
  }
}
```

Constraints (`accountPricing.service.ts → createAccountPricing`):

- Workplace must NOT be in `INACTIVE_WORKPLACE_STATUSES`. Newly-created `onboarding` workplaces pass; `closed`/`paused`/`terminated` get `BadRequestException("You cannot create account pricing for an inactive workplace")`.
- `payRateInMinorUnits` and `chargeRateInMinorUnits` capped at `100_000` (= $1,000) by the DTO.
- Duplicates on the unique tuple → Prisma `P2002` mapped to `400 "There is another account pricing with the same data."` Use `PATCH /home-health-api/api/v1/:workplaceId/account-pricing/:id` to update an existing row.
- `pricingType ∈ {PER_VISIT, PER_HOUR}`, `typeOfCare ∈ {HOME_HEALTH, HOSPICE, PRIVATE_DUTY}`.

**Seed once per `(visitType, agentReq)` you intend to create visits for.** Typical e2e seed is one row: `REGULAR` × <worker's qualification> × `PER_VISIT` × `HOME_HEALTH`. For an admission visit, seed `ADMISSION` × `RN` × `PER_VISIT` × `HOME_HEALTH`.

When LD flag `2026-01-configure-visit-rate-setting` is `{enabled: true}` for the workplace, `checkForAccountPricing` swallows the missing-pricing error and the visit is created using fallback rates from `home-health-api/src/modules/visits/fallback-rates/rate-configuration.json`. Seeding is still the cleaner path.

Visit DTO quirks (`createVisit.dto.ts`):

- `pricingType` is decorated `@IsOptional()` but the service signature is `Required<Pick<…, "pricingType">>` — pass it.
- `typeOfCare` is **not** in the request DTO — it's derived from `workplace.type` server-side.
- `visitsPerWeek` and `durationInWeeks` need numeric values (often `0` is fine for one-off visits).
- Full `VisitType` enum: `ADMISSION | ADMISSION_AND_FIRST_VISIT | REGULAR | EVALUATION | RECERTIFICATION | DISCHARGE | SUPERVISORY | RESUMPTION_OF_CARE | NURSING_EVAL`.

Patient + case shapes:

- `POST /home-health-api/api/v1/:workplaceId/patients` — JSON:API; attributes need `externalPatientIdentifier`, `formattedAddress`, `latitude`, `longitude`, `oasis: boolean`, `workplaceId`.
- `POST /home-health-api/api/v1/:workplaceId/cases` — JSON:API; attributes `{workplaceId, patientId, specialties: string[], description?}`.

Worker paths to a visit:

1. **Discover + book** — `GET /api/v1/in-home-cases?filter[booked]=false&...` → `PATCH /api/v1/visits/:id` with `{data:{attributes:{bookedWorkerId}}}`. No invite required.
2. **Invite** — workplace/admin `POST /api/v1/:workplaceId/visits/:id/invites`; worker accepts.
3. **Test-data shortcut** — set `bookedWorkerId` directly in the create body (status `FILLED`) when seeding via admin token. The worker doesn't need to be invited or have signed any agreement.

There is **no "book the case" operation** — always per-visit. Some visit types commit the worker to a multi-week cadence, but the data model reflects that via multiple occurrences on the same visit, not a case-level booking.

Worker logs the occurrence on arrival/completion via worker token: `POST /home-health-api/api/v1/visits/:visitId/occurrences` with `{data:{type:"visitOccurrence", attributes:{completedAt, pricingType, estimatedDuration?}}}`. **No background-check or Stripe gate here** — unlike shift clock-in. `PER_HOUR` requires `estimatedDuration`. New occurrences default to `status: PENDING`.

Workplace verifies via `PATCH /home-health-api/api/v1/:workplaceId/visit-occurrences/:id` with `{data:{type:"visitOccurrence", attributes:{status, rejectionReason?, paid?, instantPay?}}}`. Setting `status: REJECTED` requires `rejectionReason`.

**APPROVE side effect — bonus payment to payment-service.** When LD flag `2024-05-home-health-bonus-payment` (keyed by workplaceId) resolves true, the approve calls `POST /payment/bonuses`, which 400s if the worker has no `Account` in payment-service. Surface symptom on the HH-API patch is generic `500 "Internal server error. detail: Request failed with status code 400"`. The whole patch rolls back inside a Prisma transaction, so the occurrence stays PENDING.

Lower-env workaround (no Stripe): `POST /payment/accounts` with `{agentId, gatewayAccountCreationIsEnabled: false, accountId: "acct_e2etest_<rand>"}`. `accountId` is required at the Mongoose layer even though `CreateAccountDto` marks it optional — pass any non-empty string. Creates an `Account` with status `Instant Payouts Enabled`, `isOnboardingCompleted: true`. `gatewayAccountCreationIsEnabled` is rejected in production.

Visit status enum: `OPEN | CANCELED | FILLED | CLOSED | PENDING | CONFIRMED | LOGGED`. Occurrence: `PENDING | APPROVED | REJECTED`.

## Preferred workers

Owned by `shift-reviews-service` (Postgres, `PreferredWorker` table). Three reasons: `FAVORITE` (workplace user favorited), `RATING` (high rating post-shift, default), `INTERNAL_CRITERIA` (system signal).

Read endpoints: `GET /reviews/preferred-workers`, `/preferred-workers/:workerId/statistics`, `/preferred-workers/:workerId/workplaces`. Upserts authorized via `@AllowClients("backend-main")` — not directly writable with a user token. Matters because `RESTRICTED` workers can only book at preferred workplaces.

## Documents + licenses

Owned by `documents-service-backend`. License fields: `state`, `multiState` (boolean; true = valid in any NLC-member state), `number`, `expiresAt`, `status`. Bookability rule `isLicenseValidForState` validates against the shift's state + NLC + expiry.

Document upload is 3-step: presigned URL → PUT S3 → register via `POST /api/documents`. Admin approves via `PATCH /api/documents/:id`. Requirements are state × qualification specific.

## Attendance-policy scope

Mounted at `$API_BASE/attendance-policy/` in dev (gateway-rewritten). Owns more than clock windows — also **attendance scores**, **restrictions** (suspensions tied to scores), and **market-level config**. Controllers: `/policies`, `/restrictions`, `/scores` (`/scores/adjust`, `/scores/:id/reversals`), `/workers`, `/workers/:workerUserId/profile`, `/markets`. If you're touching no-show or late-arrival logic, this is the service.

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
- **Payment truth** — always `payment-service`, not backend-main (which can be stale). Cleanest read for worker payment history: `GET /payment/payment-logs?filter[agentId]=<workerId>` (fields: `sourceEvent`, `amount` (cents), `status`, `paymentTypeId`, `createdAt`). More useful than `GET /payment/accounts/:workerId/transfers`, which needs `startDate`+`endDate` and only returns the raw Stripe transfer object.
- **Auto-retry of failed transfers** — payment-service has an hourly cron that re-fires missing/failed transfers once the underlying account is healthy. If you trigger SHIFT_VERIFICATION before the worker has a Stripe account, the transfer fails silently; set up the account and wait up to ~1h. The retry's `payment-logs` row uses `sourceEvent: adjustMissingPayment-<original>` (e.g. `adjustMissingPayment-verification`) — same amount, same destination, just a delayed `createdAt`. So you usually don't need to manually re-trigger after fixing a prereq.
- **Datadog traces** — see the "Datadog service map" section below; **the actual service tag is never `backend-main`**, it's one of ~18 pseudo-services that all run the same monolith code. Hand off to `core:datadog-investigate` for deep dives.
- **Mailpit** — `$MAILPIT_BASE/api/v1/search?query=from:no-reply%2Bdev@updates.clipboardworks.com%20to:<email>` (URL-encode the `+`). Combine with `subject:"Your Clipboard sign-in link"` for magic links, `subject:"Your Clipboard login code"` for OTPs, or a workplace-name fragment for shift-booked / cancellation notices.
- **UI sanity check** — `$ADMIN_WEBAPP` (serves both employees and facility users) is the last resort for "did this render".

# Datadog service map

Several Clipboard repos are deployed as **multiple Datadog services running the same code**, each scoped to a different concern (HTTP path, queue, cron, etc.). Searching `service:backend-main` returns nothing — the bare repo name is not the service tag. You need to query the _specific_ pseudo-service for the path/job you care about, or fan out across the whole group.

**Backend-main monolith (`clipboard-health` repo) → 18 pseudo-services.** Same NestJS code, different deployments:

```text
cbh-backend-main             cbh-backend-main-invoices    cbh-agentprofile
cbh-bg-jobs                  cbh-bg-jobs-slow             cbh-bg-services
cbh-calendar                 cbh-cron                     cbh-db-triggers
cbh-employees                cbh-facility                 cbh-lastminute
cbh-payment                  cbh-pricing                  cbh-services
cbh-shiftmonitor             cbh-shifts                   cbh-user
```

The service-tag boundary tends to track the controller/job module name (e.g. `cbh-shifts` for shift HTTP routes, `cbh-cron` for scheduled tasks, `cbh-bg-jobs*` for queue consumers, `cbh-payment` for the _backend-main_ `/api/payment/*` routes — **not** payment-service, which is `cbh-payment-service`). When unsure which one logged your event, query across all 18 with `service:(cbh-backend-main OR cbh-agentprofile OR cbh-bg-jobs OR …)` or use a wildcard `service:cbh-*` and narrow by other tags.

**Other repos with multiple pseudo-services:**

- `clipboard-facility-app` → `cbh-facility-app`, `hcf_android_mobile_app`, `hcf_ios_mobile_app`
- `documents-service-backend` → `cbh-documents-service-backend`, `cbh-docs-merge-worker`
- `document-verification-service` → `cbh-document-verification-service`, `cbh-docverify-worker`
- `oig-automatization` → `cbh-oig-automatization`, `cbh-oig-crawler`, `cbh-oig-leie`
- `open-shifts` → `cbh-curated-shifts-web`, `cbh-backfill-service`, `cbh-migration-runner`

**Single-deployment repos (one repo, one DD service):**

`payment-service` → `cbh-payment-service`. `home-health-api` → `cbh-home-health-api-web`. `attendance-policy` → `cbh-attendance-policy`. `worker-service-backend` → `cbh-worker-service-backend`. `shift-reviews-service` → `cbh-shift-reviews-service`. `cbh-shifts-bff` → `cbh-shifts-bff`. `urgent-shifts` → `cbh-urgent-shifts` _(repo archived)_. `license-manager` → `cbh-license-manager`. `chat` → `cbh-chat`. `cbh-location-service` → `cbh-location-service`. `worker-eta` → `cbh-worker-eta` _(repo archived)_. `cbh-employee-lifecycle` → `cbh-employee-lifecycle-web`. `clipboard-staffing-api` → `cbh-staffing-api`. `pricing-parameters` → `cbh-pricing-parameters`. `shift-verification` → `cbh-shiftverify`. `billterms` → `cbh-billterms-api`. `files-storage-service` → `cbh-files-storage-service`. `identity-doc-autoverification-service` → `cbh-identity-doc-autoverification-service`. `cbh-pricing` → `facility-msa-classification`. `zendesk-jwt-service` → `cbh-zendesk-jwt-service`. `cbh-mobile-app` → `hcp_mobile_app`. `cbh-admin-frontend` → `admin_web_app`.

**To re-derive this map** (the list drifts as new pseudo-services are added — re-run when you suspect it's stale):

```bash
DD_API=$(awk -F= '/apikey/{print $2}' ~/.dogrc | tr -d ' ')
DD_APP=$(awk -F= '/appkey/{print $2}' ~/.dogrc | tr -d ' ')
curl -sS "https://api.datadoghq.com/api/v2/services/definitions?page%5Bsize%5D=200" \
  -H "DD-API-KEY: $DD_API" -H "DD-APPLICATION-KEY: $DD_APP" \
  | jq -r '
      .data
      | map({
          svc: .attributes.schema."dd-service",
          repo: ((.attributes.meta."github-html-url" // "")
                  | capture("ClipboardHealth/(?<r>[^/]+)/").r // "—")
        })
      | group_by(.repo)
      | map({repo: .[0].repo, services: [.[].svc] | sort})
      | .[]
      | "## \(.repo) (\(.services | length))\n  \(.services | join("\n  "))\n"
    '
```

The `meta.github-html-url` field on each service definition points to the source repo path (`https://github.com/ClipboardHealth/<repo>/blob/main/service.datadog.yaml`), which is how multi-deployment repos reveal their grouping. Definitions without that URL are dd-trace integration sub-services (e.g. `cbh-payment-service-worker`, `cbh-pricing-parameters-aws-sqs`) — same code, just APM-tagged by integration type.

# Troubleshooting by failure mode

- **401 Unauthorized** — token expired (Cognito ID tokens are 5 min) or wrong actor. Regenerate.
- **403 Forbidden** — **first try re-minting the token.** Cognito ID tokens expire after ~5 min and stale tokens return 403 with `"Forbidden resource"` — _identical_ to a real permission failure (not 401). After re-minting, if it's still 403: wrong App Client (`-n` flag), wrong facility-user role (`ADM | SFT | DMT | INV`), or wrong employee permission (e.g. `DELETE_HCP_DATA` needed for admin payout).
- **403 `{"code":"PermissionDenied","detail":"Forbidden resource"}` on shift create** — your admin user has `custom:user_types: EMPLOYEE` (so workplace creation worked) but no `EmployeeProfile` doc. `ShiftCreateAuthorizer` (`shift-create.authorizer.ts:54`) bounces the request without a useful error. Switch to `e2e@clipboardhealth.com` (or another admin known to have an `EmployeeProfile`) and retry.
- **400 "The offered rate for this shift is no longer valid"** on `/api/shifts/claim` — `offerId` is required and must point at a real `shift-offer` (the rate-negotiation guard runs even with `override:true`). Create one first via `POST /api/shifts/:shiftId/offers` (JSON:API body) and pass that `id`. Without this two-step, admin manual-assign always 400s.
- **400 on write** — grep the controller named in the concept's "source" and read the DTO. Payload shapes drift.
- **`PUT /api/shift/put` 400 `"Cannot update shift because it is already verified."`** Verified shifts are immutable to PUT — edit `start` / `end` / `clockInOut` **before** verifying. Sequence for a past-dated, verified, 1099-fee-bearing shift: create at `start = +1h` → claim → create 1099 assignment (`effective_date` must be future) → PUT to move `start` / `end` / `clockInOut` into the past while still unverified → `POST /api/shift/verification/verify`.
- **HH-API `PATCH visit-occurrences/:id` returns 500 "Request failed with status code 400"** on `status:APPROVED` — bonus-payment side effect to payment-service is failing. Most common cause: worker has no `Account` in payment-service. Fix in dev: create a Stripe-skipped account via `POST /payment/accounts` with `gatewayAccountCreationIsEnabled:false` and a non-empty synthetic `accountId`. Then retry the approve. REJECTED and PENDING don't trigger this path.
- **HH-API "Account pricing for visit type does not exist"** (500) on visit create — `AccountPricing` row missing for the tuple `(workplaceId, agentReq, visitType, pricingType, typeOfCare)`. Seed via `POST /home-health-api/api/v1/:workplaceId/account-pricing` before the visit. Remember `agentReq` is auto-coerced to `RN` for admission-family visit types; seed accordingly. See the Home Health concept section for the full body and constraints.
- **HH-API "Workplace not found" / 403 on `/home-health-api/api/v1/:workplaceId/...`** — you're passing the FacilityProfile `_id` instead of the workplace User.\_id. Use the top-level `id` returned by `POST /api/facilityprofile/create`.
- **`POST /api/1099-policy/assignments` returns 500 with `"Request failed with status code 400"` in dev.** The underlying 400 is from the 1099Policy.com sandbox; check Datadog `service:backend-main @logger.logContext:Ten99PolicyGateway` for the `error.response.data` body. Three common causes:
  1. **Production category codes don't exist in the sandbox account.** `ten99-policy.constants.ts` defaults to `jc_LsJrariN5V` (CA convalescent home) and `jc_o5vABnBQRj` — both are _production_ codes. The dev sandbox has its own set. Fetch the sandbox's category list from the 1099Policy sandbox dashboard (Categories tab — graphql query `jobCategory`), then **`PATCH /api/workplaces/:workplaceId`** with `data.attributes.ten99PolicyJobCategoryCode = "<sandbox jc_*>"` (CBH-employee only) to swap. Sandbox equivalents as of Apr 2026: `jc_H6HrYFmcRS` (Convalescent Home, CA), `jc_gFzGNVvd24` (Skilled Nursing), `jc_aKhKXXKTGc` (Retirement), `jc_LAK75HcvTk` (Home Health), `jc_RdPg4vejMw` (Hospital).
  2. **Assignment `effective_date` must be in the future.** Per the 1099Policy API (see `ten99-policy-api.types.ts:333`). Past-window shifts always 400 here. Create the assignment while the shift's `start` is still in the future, then `PUT /api/shift/put` to fast-forward `time`/`clockInOut`/`verified`.
  3. **Worker hasn't bound a policy in the sandbox.** Walking the application URL only marks our internal `applicationSubmissionDate` if you fire the webhook ourselves; the policy is only bound after walking through the sandbox UI all the way to "You've successfully signed up for coverage". Until then, no `policy.active` event fires and assignments 400.
- **Stale read** — payment or upcoming-charges state read from backend-main may lag. Read from the owning service (payment-service, shift-reviews-service, documents-service, home-health-api).
- **Async delays** — bonus → upcoming-charges is ~30s via SQS; invoice generation is ~30–60s; Stripe sandbox occasionally blips.
- **"Can't find endpoint"** — grep `clipboard-health/openapi.json` for the path (2.1 MB, grep only — never read in full). Or grep `@Controller`, `@Post`, `@Patch` in the owning service.

# Browser fallback (Mailpit magic-link)

Use only when no API exists (the login form itself; visual-only changes; phone-OTP-gated worker signup).

1. Navigate to `$ADMIN_WEBAPP` (employees and facility users) or `https://hcp-webapp.development.clipboardhealth.org` (workers).
2. Enter email → trigger magic-link.
3. Poll Mailpit, scoped to the trusted sender + the right subject:

   ```bash
   # magic link (admin / facility / worker email-link login)
   curl -sS -u "$MAILPIT_USER:$MAILPIT_PASS" \
     "$MAILPIT_BASE/api/v1/search?query=from:no-reply%2Bdev@updates.clipboardworks.com%20to:%22$EMAIL%22%20subject:%22Your%20Clipboard%20sign-in%20link%22" \
     | jq '.messages[0].ID'

   # OTP (phone-aliased emails like 4153445892.phone.email@testmail.com)
   curl -sS -u "$MAILPIT_USER:$MAILPIT_PASS" \
     "$MAILPIT_BASE/api/v1/search?query=from:no-reply%2Bdev@updates.clipboardworks.com%20to:%22$EMAIL%22%20subject:%22Your%20Clipboard%20login%20code%22" \
     | jq '.messages[0].ID'
   ```

4. Fetch the message and extract the link/code:

   ```bash
   curl -sS -u "$MAILPIT_USER:$MAILPIT_PASS" "$MAILPIT_BASE/api/v1/message/<ID>" \
     | jq -r '.HTML // .Text' \
     | grep -Eo 'https://[^"[:space:]]+'   # or grep the 6-digit OTP
   ```

5. Validate the link host against the allowlist (Hard guardrails rule 2) before navigating.

**Address conventions in the dev mailbox:**

- `<10-digits>.phone.email@testmail.com` — phone-aliased OTP recipients
- `playwright-<id>@playwright-hcp.com` and `playwright-<id>-email-link-<rand>@playwright-hcp.com` — Playwright e2e workers
- `seeddata-<name>+<num>@seeddata.com` — seed-data scenarios
- `<name>+<suffix>@clipboardhealth.com` — manual dev users

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
- `clipboard-health/src/modules/shifts/entrypoints/internal/shift-create.authorizer.ts` — the gate behind generic 403 _"Permission to resource denied"_ when an admin lacks an `EmployeeProfile`.
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
- `payment-service/src/app/payments/transfers/accounts-transfers.controller.ts` — transfers. GET needs `startDate`+`endDate`; transfers are fired via SQS events from backend-main's `triggerShiftPayment`, no direct POST.
- `payment-service/src/app/payments/payment-logs/payment-logs.controller.ts` — `GET /payment/payment-logs` is the canonical worker payment history read (see Verification patterns).
- `payment-service/src/app/accounts/accounts.controller.ts` — account reads.
- `payment-service/src/app/payouts/payouts.controller.ts` — payouts.
- `payment-service/src/app/bonuses/bonuses.service.ts` — bonus entity and `createBonusPayment`.
- `home-health-api/src/modules/cases/cases.worker.controller.ts` — worker browse.
- `home-health-api/src/modules/cases/cases.workplace.controller.ts` — workplace/admin case CRUD (`POST /api/v1/:workplaceId/cases`).
- `home-health-api/src/modules/patients/patients.controller.ts` — patient CRUD (`POST /api/v1/:workplaceId/patients`).
- `home-health-api/src/modules/visits/visits.{worker,workplace}.controller.ts` — visit endpoints; worker controller hosts `POST /api/v1/visits/:visitId/occurrences`.
- `home-health-api/src/modules/visits/visits.service.ts` — `checkForAccountPricing` enforces account-pricing precondition; `typeOfCare` derived from workplace.
- `home-health-api/src/modules/visits/dtos/createVisit.dto.ts` — note `pricingType` is `@IsOptional` but service requires it; no `typeOfCare` in body.
- `home-health-api/src/modules/visits-occurrences/visitsOccurrences.workplace.controller.ts` — occurrence approval (`PATCH /api/v1/:workplaceId/visit-occurrences/:id`).
- `home-health-api/src/modules/visits-occurrences/visitsOccurrences.service.ts` — `triggerPayment` is the bonus-payment side effect on APPROVED; gated by LD flag `2024-05-home-health-bonus-payment` (keyed by workplaceId).
- `home-health-api/src/modules/account-pricing/accountPricing.workplace.controller.ts` — `POST /api/v1/:workplaceId/account-pricing` to seed pricing. Service enforces inactive-workplace + P2002-duplicate guards.
- `home-health-api/src/modules/visits/fallback-rates/rate-configuration.json` — fallback charge rates used when LD flag `2026-01-configure-visit-rate-setting` is on and no pricing row exists.
- `@clipboard-health/flag-backend-main/src/lib/feature-flags/inHome.featureFlags.ts` — HH LD flag string constants (`VISIT_RATE_SETTING_FEATURE_FLAG`, `BONUS_PAYMENT_HH_ENABLED_FEATURE_FLAG`).
- `home-health-api/src/modules/cbh-core/utils.ts → stringTypeOfCareToEnum` — workplace.type ("Home Healthcare", "Hospice", …) → `TypeOfCare` enum mapping.
- `home-health-api/src/modules/cbh-core/cbhPayment.service.ts` — bonus-payment HTTP call to payment-service (`POST /bonuses`).
- `home-health-api/prisma/schema.prisma` — visit/occurrence/case/patient models, full `VisitType` and `TypeOfCare` and `PricingType` enums.
- `payment-service/src/app/accounts/accounts.controller.ts:204` — `POST /accounts` create flow; `gatewayAccountCreationIsEnabled:false` skips Stripe in non-prod, but Mongoose validation still requires non-empty `accountId`.
- `documents-service-backend/src/app/rest-api/controllers/hcp-documents.controller.ts` — documents.
- `documents-service-backend/src/app/rest-api/licenses/dtos/license-data.dto.ts` — license schema.
- `shift-reviews-service/src/...` — preferred workers.
- `attendance-policy/src/...` — attendance policies/scores/restrictions.
- `cbh-core/packages/cli/src/oclif/auth/gentoken.ts` — CLI token flow.
- `cbh-core/packages/testing-e2e-admin-app/src/lib/constants.ts` — **reference payloads** (`DEFAULT_*` bodies).
- `cbh-core/packages/testing-e2e-admin-app/src/lib/admin-service.ts` — `AdminService` orchestration reference.
- `cbh-core/packages/testing-e2e-admin-app/src/lib/service-urls.ts` — env → URL map.
- `clipboard-health/src/modules/ten99-policy/ten99-policy.constants.ts` — production-only category codes; CONVALESCENT_HOME state list.
- `clipboard-health/src/modules/ten99-policy/types/ten99-policy-api.types.ts` — 1099Policy.com API constraints (wage min/max, address shape, `effective_date` must be future).
- `clipboard-health/src/modules/ten99-policy/logic/ten99-policy.service.ts` — `createAssignment` orchestration (createJob → createAssignment in 1099Policy → record netRate).
- `clipboard-health/src/modules/ten99-policy/logic/ten99-policy-assignment-fee-calculation.service.ts` + `utils/compute-shift-ten99-policy-fee.ts` — fee math (uses BASE_PAY-named offer rule outputs when present, else falls back to `shift.pay × 100`).
- `clipboard-health/src/modules/ten99-policy/entrypoints/ten99-policy.dto.mapper.ts` — note: GET-jobs mapper does NOT surface `assignmentFeeInCents`; use `GET /api/shifts/:id/1099-policy/assignments` for the fee read.
- `clipboard-health/src/modules/worker-payment/domain/shift-payment.domain.ts` (and `.spec.ts`) — deduction code path; **only `TIMESHEET_UPLOAD` and `RETRY_MISSING_PAYMENT_TIMESHEET_UPLOAD` subtract the fee from payable amount** (VAU-1106).
- `clipboard-health/node_modules/@clipboard-health/contract-backend-main/src/lib/ten99Policy.contract.ts` — endpoints: `POST /api/1099-policy/application-sessions`, `POST /api/1099-policy/assignments`, `POST /api/workplaces/:wpId/1099-policy/entities`, `GET /api/shifts/:id/1099-policy/assignments`, `GET /api/workers/:wId/1099-policy/jobs`, `POST /api/1099-policy/events`.

If any path 404s on your machine, ask the user for the correct location — repos may be under a different root.
