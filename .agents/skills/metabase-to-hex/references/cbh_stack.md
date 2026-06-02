# Clipboard Health data stack — IDs and schemas

Quick reference for the Metabase / Hex / Snowflake setup. These IDs are stable
and reused across every migration.

## Metabase

- Host: `metabase.cbh.rocks`
- Dashboard URL pattern: `https://metabase.cbh.rocks/dashboard/<id>`
- Two MCPs available:
  - `mcp__metabase-cognitionai__*` — richer (has `get_dashboard`, `get_card`,
    `list_tables`). Periodically returns 401 across all endpoints when its
    credential refresh hiccups.
  - `mcp__metabase-server__*` — basic CRUD plus `execute_query` / `execute_card`.
    Use as fallback. `execute_card` requires `parameters` as a list `[]`, not
    `{}` (schema bug).

## Hex

- Workspace: `e673b166-274e-4db9-972d-badc91dbfe1b`
- CLI: `hex` (alex already authenticated)
- Project URL pattern: `https://app.hex.tech/<workspace>/hex/<slug>/draft/logic`

### Snowflake data connections

The one you choose matters because of the workspace member permission model.

| Connection                                    | ID                                     | When to use                                                                                                                                                        |
| --------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Snowflake (Small Warehouse)**               | `f5606b78-4aba-4d11-9820-8712a8c765b2` | Default for dev/draft. Workspace members have QUERY access — alex can run cells.                                                                                   |
| `snowflake analytics`                         | `530b70b8-b300-43c9-9b3e-e4b98ded0379` | Larger warehouse, same dev access.                                                                                                                                 |
| `Hex Apps: Snowflake PII Service Account`     | `019bb2d8-d867-7001-bb8a-ccb8b6d16e8a` | Publish-time only — workspace members get VIEW_RESULTS, not QUERY. Cells silently return empty when alex runs them. The published app runs as the service account. |
| `Hex Apps: Snowflake Non-PII Service Account` | `019da967-268c-700b-a1b1-f8f81f0e8c29` | Similar to PII — verify access before using.                                                                                                                       |

Default to Small Warehouse for the migration. If the dashboard needs PII columns
at publish time, switch the cells to the PII service account just before
publishing (the user can do this in the UI).

## Snowflake (database: `ANALYTICS`)

### Schemas

- `DBT_PRODUCTION_CORE` — fact and dim tables. **Prefer for migrations.**
- `DBT_PRODUCTION` — staging models. `STG_APP__*` is the newer naming; `APP_*_STG`
  is legacy. Prefer the former.
- `INTERVENTIONS` — ops intervention tracking.
- `SEGMENT_*` — Segment event data.
- `PII_REPORTING` — PII-restricted, usually accessed via the PII service account.

### Common core fact/dim tables

- `FCT_SHIFTS` — primary shift fact (includes clock in/out, geofence, pay,
  verification status, departure timestamps)
- `FCT_SHIFT_LOGS` — shift state changes / audit log (cancellations, rate
  changes, time changes)
- `FCT_SHIFT_OFFERS` — ~4B rows; always filter by `SHIFT_ID` or `WORKER_ID` AND
  a recent date range to keep micro-partition pruning effective
- `FCT_EXCLUSIONS` — DNR / facility exclusion records, joined with worker /
  workplace names
- `DIM_WORKERS` — worker dimension (FULL_NAME, EMAIL, QUALIFICATION, STATE, MSA,
  REFERRER_ID, REFERRAL_CODE, ACCOUNT_STAGE, CREATED_AT)
- `DIM_WORKPLACES` — workplace dimension (NAME, TYPE, MSA, STATE, STATE_CODE,
  VERIFICATION_PREFERENCE, REQUIRES_LUNCH_BREAK, PARENT_FACILITY_ID,
  SALESFORCE_PARENT_ACCOUNT_NAME, ACCOUNT_STAGE)

### Common staging tables (when core doesn't have what you need)

- `DBT_PRODUCTION.STG_APP__FACILITY_CANCELLED_ME_REQUESTS` — FCM workflow.
  Columns: `FACILITY_CANCELLED_ME_REQUEST_ID`, `SHIFT_ID`, `WORKER_ID`,
  `REASON_TYPE`, `IS_DELETED`, `IS_APPROVED`, `IS_AT_FACILITY`,
  `PERFORMED_BY[_ROLE]`, `RESPONSE_DESCRIPTION`, `REQUEST/RESPONSE_LEAD_TIME`,
  `CREATED_AT`, `UPDATED_AT`. NB: no `FACILITY_ID`.
- `DBT_PRODUCTION.STG_APP__BONUSES_PAYMENTS` — bonus payment ledger. Columns
  include `AGENT_ID`, `SHIFT_ID`, `REASON`, `BONUS_AMOUNT_IN_DOLLARS`,
  `STATUS`, `TYPE`, `BONUS_CATEGORY`. The `REASON` field is text and contains
  patterns like `IPR Shift SOP Courtesy`, `PA Rate SOP Courtesy`,
  `SelfCancel Courtesy` used in the 1st-incident eligibility tools.
- `DBT_PRODUCTION.STG_APP__GEOFENCE_EVENTS` — when you need raw geofence events;
  prefer derived columns on FCT_SHIFTS first.
- `DBT_PRODUCTION.STG_APP__SHIFT_LOGS` — raw shift logs (use FCT_SHIFT_LOGS first).
- `DBT_PRODUCTION.STG_APP__EXTRA_TIME_PAY_SETTINGS_CHANGE_LOGS` — ETP settings
  history (no core table).

### Legacy → core swap cheatsheet

When you see Metabase native_form referencing these, rewrite to the right column.

| Legacy table                                         | Replacement                                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| `APP_SHIFTLOGS_STG`                                  | `DBT_PRODUCTION_CORE.FCT_SHIFT_LOGS`                              |
| `APP_EXCLUSIONS_STG`                                 | `DBT_PRODUCTION_CORE.FCT_EXCLUSIONS`                              |
| `APP_AGENTPROFILES_STG`, `APP_PII_AGENTPROFILES_STG` | `DBT_PRODUCTION_CORE.DIM_WORKERS`                                 |
| `STG_APP__FACILITY_PROFILES`                         | `DBT_PRODUCTION_CORE.DIM_WORKPLACES`                              |
| `APP_FACILITYCANCELLEDMEREQUESTS_STG`                | `DBT_PRODUCTION.STG_APP__FACILITY_CANCELLED_ME_REQUESTS`          |
| `APP_BONUSESPAYMENTS_STG`                            | `DBT_PRODUCTION.STG_APP__BONUSES_PAYMENTS`                        |
| `APP_SHIFTGEOFENCEEVENTS_STG`                        | `DBT_PRODUCTION_CORE.FCT_SHIFTS` (clock_out, geofence_at columns) |
| `STG_APP__SHIFT_LOGS`                                | `DBT_PRODUCTION_CORE.FCT_SHIFT_LOGS`                              |

For tables not in this list: search `INFORMATION_SCHEMA.TABLES` for `STG_APP__*`
or core equivalents before assuming a swap.

```sql
SELECT TABLE_SCHEMA, TABLE_NAME
FROM ANALYTICS.INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA IN ('DBT_PRODUCTION', 'DBT_PRODUCTION_CORE')
  AND TABLE_NAME ILIKE '%<keyword>%'
ORDER BY TABLE_SCHEMA, TABLE_NAME;
```

## Past migrations (for reference / SQL reuse)

- **WOPs Tool dashboard 1898** → Hex `019e08cb-79c0-7000-84c7-003f187d2669`.
  Local v3 SQL at `/home/alex/wops_migration/hex_cells_v3/`. 47 SQL cells
  covering DNR, GWG, Lateness/LEPs, Favorites, Shift Logs, Pay Rate Changes,
  Worker/Workplace Details, Urgent Shift, Shift Radar, Worker↔Workplace
  Messages, Referrals, PSST, Notification Settings, ETP Change Logs, Payment
  Main, CA Shift Verification, Extra Worked Time.

- **Payments Team dashboard 1242** → Hex `019e275f-50bf-7000-8043-ad906145f55c`.
  20 SQL cells. Heavy overlap with WOPs Tool — 13 of 20 reused v3 SQL.

If the new migration includes any of those topics, check the v3 SQL folder first
before writing new SQL. Audit reused SQL for stale variable references (see
gotcha 2).
