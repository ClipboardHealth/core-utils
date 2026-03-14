---
name: seed-data
description: Trigger seed data generation for test environments via GitHub Actions. Use when asked to seed, create test data, or set up HCPs/facilities/shifts.
allowed-tools: Bash
---

# Seed Data Generation

Trigger the `Generate Seed Data` GitHub Actions workflow to create test data in development, staging, or prod-shadow environments.

## Glossary

These terms appear in scenario names and user requests:

| Term       | Meaning                                                                                     | Also known as                |
| ---------- | ------------------------------------------------------------------------------------------- | ---------------------------- |
| **HCP**    | Healthcare Professional — a worker on the supply side of the marketplace (nurse, CNA, etc.) | worker, professional, nurse  |
| **HCF**    | Healthcare Facility — a workplace on the demand side that posts shifts                      | workplace, facility          |
| **LTC**    | Long-Term Care — a type of workplace (nursing homes, skilled nursing facilities)            | nursing home, care home, SNF |
| **CNA**    | Certified Nursing Assistant — a worker qualification                                        | nursing assistant            |
| **RN**     | Registered Nurse — a worker qualification                                                   | nurse                        |
| **LPN**    | Licensed Practical Nurse — a worker qualification                                           | LVN                          |
| **Stripe** | Payment processing account used to pay workers                                              | payment account              |
| **Shift**  | A time slot at a workplace that a worker can book and work                                  |                              |

## Step-by-Step Instructions

1. **Match the user's intent** to a scenario using the lookup table below. If the request is ambiguous, present the top matches and ask the user to pick one.
2. **Determine environment** — default to `development` unless the user specifies otherwise. Valid options: `development`, `staging`, `prod-shadow`.
3. **Determine count** — default to `1` unless the user specifies a different number.
4. **Collect input data** — if the matched scenario requires `input_data` (see Input Data Requirements below), ask the user for the required fields before proceeding. Never fabricate IDs — always ask.
5. **Construct the `gh workflow run` command.** If the scenario requires `input_data` or the user specified a non-default environment/count, show the command and ask for confirmation. Otherwise, execute immediately.
6. **Execute** the command. The `gh workflow run` command prints the run URL directly — capture and display it.
7. **Wait for completion** — poll the run until it finishes, then download and display the results:

   ```bash
   # Get the run ID from the URL (last path segment), then watch it
   gh run watch <RUN_ID> --repo ClipboardHealth/cbh-core --exit-status
   ```

   - If the run **succeeds**, download the logs artifact and display its contents:
     ```bash
     gh run download <RUN_ID> --repo ClipboardHealth/cbh-core --name seed-data-logs --dir /tmp/seed-data-logs
     cat /tmp/seed-data-logs/logs.json
     ```
     Parse the JSON and present the key results to the user (e.g., created entity IDs, names, environment).
   - If the run **fails**, fetch the failed step logs and surface the error:
     ```bash
     gh run view <RUN_ID> --repo ClipboardHealth/cbh-core --log-failed
     ```

## Command Templates

### Without input_data

```bash
gh workflow run "Generate Seed Data" \
  --repo ClipboardHealth/cbh-core \
  -f environment=<ENVIRONMENT> \
  -f numberOfTestData=<COUNT> \
  -f scenario=<SCENARIO_KEY>
```

### With input_data

```bash
gh workflow run "Generate Seed Data" \
  --repo ClipboardHealth/cbh-core \
  -f environment=<ENVIRONMENT> \
  -f numberOfTestData=<COUNT> \
  -f scenario=<SCENARIO_KEY> \
  -f 'input_data=<JSON_STRING>'
```

## Scenario Lookup Table

> **Note:** Scenario numbers 13 and 18 do not exist. If a user references them, let them know and present the full list below.

| Key                                                                  | Description                                                                  | Keyword Hints                                                           |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `scenario-1-create-hcp-without-stripe`                               | Create a worker (HCP) without a Stripe payment account                       | hcp, worker, nurse, no stripe, basic hcp, create a nurse                |
| `scenario-2-create-surgery-facility`                                 | Create a surgery center workplace                                            | surgery, surgical, facility, center                                     |
| `scenario-3-create-ltc-facility`                                     | Create a long-term care workplace (nursing home)                             | ltc, long term care, nursing home, care home, facility                  |
| `scenario-4-create-hcp-with-stripe`                                  | Create a worker (HCP) with a Stripe payment account                          | hcp with stripe, worker stripe, paid worker, nurse with payment         |
| `scenario-5-create-hcp-hcf-and-shift`                                | Create a worker + workplace + shift together (full test setup)               | hcp facility shift, full setup, end to end, everything, full test setup |
| `scenario-6-create-hcp-with-multiple-licenses`                       | Create a worker with multiple license types                                  | multiple licenses, multi-license, hcp licenses                          |
| `scenario-7-create-shift-at-clock-in-stage`                          | Create a shift that is ready to clock in                                     | clock in, shift ready, check in, shift about to start                   |
| `scenario-8-create-rate-negotiation-hcf-multiple-hcp-pair`           | Create a rate negotiation scenario with a workplace and multiple workers     | rate negotiation, pricing, negotiation                                  |
| `scenario-9-create-shift-and-perform-until-clock-out`                | Create a shift and run through the full lifecycle to clock out               | clock out, full shift, complete shift                                   |
| `scenario-10-create-shift-and-perform-until-clock-out-for-given-hcf` | Same as scenario 9 but at a specific workplace (requires facility ID)        | clock out given facility, specific facility shift                       |
| `scenario-11-create-hcp-with-stripe-near-given-facility`             | Create a worker with Stripe near a specific workplace (requires facility ID) | hcp near facility, nearby hcp, stripe near, worker near                 |
| `scenario-12-create-shift-at-clock-in-stage-for-given-hcf`           | Create a clock-in-ready shift at a specific workplace (requires facility ID) | clock in specific facility, shift at facility                           |
| `scenario-14-move-shifts-back-or-forth`                              | Move existing shifts forward or backward in time                             | move shifts, reschedule, shift time, back forth                         |
| `scenario-15-clean-old-test-data`                                    | **DESTRUCTIVE** — delete old test data                                       | clean, cleanup, delete test data, purge                                 |
| `scenario-16-create-hcf-hcp-and-shifts-in-past-week`                 | Create workplace + worker + shifts dated in the past week                    | past week, historical, backfill, past shifts                            |
| `scenario-17-recreate-hcf-hcp-and-shifts-sales-demo-usecase`         | Set up a sales demo with workplace, worker, and shifts                       | sales demo, demo, showcase, demo data, sales presentation               |
| `scenario-19-create-shift-ready-to-clock-out`                        | Create a shift that is ready to clock out                                    | ready clock out, pending clock out                                      |
| `scenario-20-seed-workplace-review-data`                             | Seed workplace review / rating data                                          | workplace review, ratings, reviews                                      |
| `scenario-21-seed-attrition-data`                                    | Seed attrition analytics data                                                | attrition, churn, retention                                             |

## Input Data Requirements

Some scenarios accept or require a JSON `input_data` field. Ask the user for these values — **never fabricate IDs**.

### Scenario 10 — Clock out shift at a specific workplace

Required fields:

- `facilityId` (string) — the target workplace's ID
- `hcpWorkerType` (string) — one of `CNA`, `RN`, `LPN`

Example:

```json
{ "facilityId": "<FACILITY_ID>", "hcpWorkerType": "CNA" }
```

### Scenario 11 — Create worker with Stripe near a specific workplace

Required fields:

- `facilityId` (string) — the workplace to create the worker near
- `hcpWorkerType` (string) — one of `CNA`, `RN`, `LPN`

Example:

```json
{ "facilityId": "<FACILITY_ID>", "hcpWorkerType": "RN" }
```

### Scenario 12 — Clock-in-ready shift at a specific workplace

Required fields:

- `facilityId` (string) — the workplace to create the shift at
- `hcpWorkerType` (string) — one of `CNA`, `RN`, `LPN`

Example:

```json
{ "facilityId": "<FACILITY_ID>", "hcpWorkerType": "LPN" }
```

### Scenario 14 — Move shifts

Required fields:

- `shiftIds` (string[]) — array of shift IDs to move

Optional fields:

- `duration` (number) — hours to move shifts by. **Positive = forward in time, negative = backward in time.**

Example:

```json
{ "shiftIds": ["<SHIFT_ID_1>", "<SHIFT_ID_2>"], "duration": 24 }
```

### Scenario 15 — Clean old test data

All fields optional:

- `emailPattern` (string) — pattern to match test emails
- `ageThreshold` (number) — age in days beyond which to clean

Example:

```json
{ "emailPattern": "+test", "ageThreshold": 30 }
```

### Scenario 21 — Seed attrition data

Optional fields:

- `facilityId` (string) — scope to a specific workplace

Example:

```json
{ "facilityId": "<FACILITY_ID>" }
```

## Behavioral Rules

1. **Default environment is `development`** — 87% of actual usage targets development. Only use other environments when explicitly requested.
2. **Default count is `1`** — override only when the user specifies a number.
3. **Never fabricate IDs** — if a scenario requires a `facilityId`, `shiftId`, or other identifier, ask the user to provide it.
4. **Confirm before executing** — show the full `gh workflow run` command and get user approval **only** when the scenario requires `input_data` or the user specified a non-default environment or count. If the scenario needs no `input_data` and defaults are used, execute immediately without confirmation.
5. **Handle ambiguity** — if the user's request matches multiple scenarios, present the top candidates with descriptions and ask them to pick.
6. **Auth errors** — if `gh` returns an authentication error, instruct the user to run `gh auth login` and retry.
7. **No `input_data` when not needed** — omit the `-f input_data=...` flag entirely for scenarios that don't require it.
8. **"Run all scenarios" is not supported via this skill** — if the user asks to run all scenarios at once, explain that this is only available through the [GitHub Actions UI](https://github.com/ClipboardHealth/cbh-core/actions/workflows/generate-seed-data.yml) by leaving the scenario dropdown blank. Do not omit the `-f scenario=...` flag to trigger all scenarios.
9. **Destructive scenario warning** — for scenario 15 (clean old test data), always display an explicit warning that this **deletes data**, confirm the target environment twice, and never run it with all optional fields left empty (require the user to specify at least `emailPattern` or `ageThreshold`).
10. **Failure handling** — always wait for the run to complete (step 7). Never just print the URL and stop.
