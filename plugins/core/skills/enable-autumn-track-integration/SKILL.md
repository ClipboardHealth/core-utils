---
name: enable-autumn-track-integration
description: >
  Enable 1-way or 2-way Autumn Track (StaffLion) external integration for workplaces.
  Creates the migration PR, enables LaunchDarkly feature flags, and triggers Hex data sync.
  Use when user says "enable autumn track", "enable stafflion integration",
  "add autumn track integration", or "enable external integration for autumn track".
---

# Enable Autumn Track (StaffLion) Integration

End-to-end skill for enabling Autumn Track external integration for workplaces.

## Prerequisites

Before running this skill, confirm the following are available:

1. **LaunchDarkly MCP** — Required to toggle feature flags. Ask:
   > "Do you have the LaunchDarkly MCP server configured? I need it to enable feature flags."
2. **Hex access** — Required for data export/sync (1-way integration). Ask:
   > "Do you have access to the [Hex Autumn Track data export app](https://app.hex.tech/e673b166-274e-4db9-972d-badc91dbfe1b/app/Autumn-Track-integration-data-export-030NgmV37zGw6dtFKj5ABV/latest)?"
3. **clipboard-health repo** — This skill creates a migration and raises a PR. Must be run inside the `clipboard-health` monorepo.

If any prerequisite is missing, stop and inform the user what's needed.

## Gather Information

Ask the user:

1. **Integration type**: 1-way (Clipboard → Autumn Track only) or 2-way (bidirectional: includes StaffLion → Clipboard shift posting/cancellation)?
2. **Workplace name(s) and ID(s)**: List of workplaces to enable (MongoDB ObjectId for each).

## Steps

### Step 1: Create External Integration via API

Use the `POST /api/workplaces/:workplaceId/external-integrations` endpoint to create the integration config. This requires a CBH employee auth token.

**curl template:**

```bash
curl -X POST "https://api.clipboardhealth.com/api/workplaces/<WORKPLACE_ID>/external-integrations" \
  -H "Content-Type: application/json" \
  -H "Authorization: <CBH_EMPLOYEE_AUTH_TOKEN>" \
  -d '{
    "data": {
      "type": "workplace-external-integration",
      "attributes": {
        "type": "AUTUMN_TRACK",
        "isEnabled": true,
        "events": ["SHIFT_ASSIGNED", "SHIFT_UNASSIGNED", "SHIFT_DELETED", "SHIFT_TIME_UPDATED"],
        "autumnTrack": {}
      }
    }
  }'
```

Run this for each workplace ID provided by the user. The endpoint is idempotent — it returns 409 if the integration already exists.

**Handling child workplaces (422 "Parent workplace doesn't have a AUTUMN_TRACK integration"):**

If the API returns a 422 with this message, the workplace is a child facility and its parent needs the integration enabled first.

1. **Find the parent workplace ID:**
   - If Hex MCP is available, query `dim_workplaces` for the `parent_facility_id` of the child workplace.
   - Otherwise, ask the user for the parent workplace ID.

2. **Create the integration on the parent first:**

```bash
curl -X POST "https://api.clipboardhealth.com/api/workplaces/<PARENT_WORKPLACE_ID>/external-integrations" \
  -H "Content-Type: application/json" \
  -H "Authorization: <CBH_EMPLOYEE_AUTH_TOKEN>" \
  -d '{
    "data": {
      "type": "workplace-external-integration",
      "attributes": {
        "type": "AUTUMN_TRACK",
        "isEnabled": true,
        "autumnTrack": {}
      }
    }
  }'
```

3. **Then retry creating the integration on the child workplace** — the child will inherit events and settings from the parent.

#### Alternative: Migration PR

If the API is not accessible (e.g., no auth token available), fall back to creating a migration file at `src/migrations/<date>-add-external-integration-config-autumn-track.ts` following the pattern from [PR #15144](https://github.com/ClipboardHealth/clipboard-health/pull/15144).

The migration should:

- Import `ExternalIntegrationModel` from `@/models/ExternalIntegrations`
- Import `ExternalIntegrationEvents`, `ExternalIntegrationTypes` from `@/models/ExternalIntegrations/types`
- Import `FacilityProfileModel` from `@/models/FacilityProfile`
- For each workplace ID:
  - Verify the facility exists via `FacilityProfileModel.findOne({ userId: ObjectId })`
  - Check if an `AUTUMN_TRACK` integration already exists (idempotent)
  - Create the `ExternalIntegration` document with:
    - `isEnabled: true`
    - `events: [SHIFT_ASSIGNED, SHIFT_UNASSIGNED, SHIFT_DELETED, SHIFT_TIME_UPDATED]`
    - `settings: { integrationType: AUTUMN_TRACK, workplaceId: ObjectId }`
- Add workplace names as comments next to each ID

Commit, push, and create a PR. Use the `commit-push-pr` skill if available.

### Step 2: Main Feature Flag (no action needed)

The main external integrations flag `2024-11-21-enable-external-integrations` is enabled by default for all workplaces. No action required here.

### Step 3: Enable Autumn Track Adapter Feature Flag

Enable the Autumn Track-specific adapter flag:

- **Flag**: `2024-11-27-enable-autumn-track-scheduling-integration`
- **Project**: `default`
- **Environment**: `production`
- Add each workplace ID to the flag's targeting rules.

Use the LaunchDarkly MCP to update the flag.

### Step 4: Data Export/Sync (1-way and 2-way)

For the initial data sync, existing shifts need to be exported and shared with Autumn Track (StaffLion) so their system is in sync before the integration goes live.

**If Hex MCP is available:**
Use the Hex MCP to run the [Autumn Track data export app](https://app.hex.tech/e673b166-274e-4db9-972d-badc91dbfe1b/app/Autumn-Track-integration-data-export-030NgmV37zGw6dtFKj5ABV/latest) directly — download the `.csv` for shifts that are booked but not yet verified and in the future. Then share the file with the user to forward to their Autumn Track contact.

**If Hex MCP is NOT available:**
Tell the user:

> "Run the [Hex Autumn Track data export app](https://app.hex.tech/e673b166-274e-4db9-972d-badc91dbfe1b/app/Autumn-Track-integration-data-export-030NgmV37zGw6dtFKj5ABV/latest) to export current shift data, then share the CSV with your Autumn Track contact for ingestion."

### Step 5: Enable 2-Way Integration (only if 2-way selected)

If the user chose 2-way integration, also enable the StaffLion two-way integration flag:

- **Flag**: [`2025-05-forge-staff-lion-integration-config`](https://app.launchdarkly.com/projects/default/flags/2025-05-forge-staff-lion-integration-config?env=development&env=prod-shadow&env=production&env=staging&selected-env=production)
- **Project**: `default`
- **Environment**: `production`
- **Important**: This flag is NOT target-based like the other flags. Add each workplace ID directly to the `production` **variation value** (the list/array in the variation itself). Do not add it as an individual target or targeting rule.

Use the LaunchDarkly MCP to update the flag's production variation to include the new workplace IDs.

### Step 6: Verify

After enabling, check the [Datadog integration dashboard](https://app.datadoghq.com/dashboard/smr-hbh-bcd) to confirm logs are flowing for the enabled facilities.

Tell the user:

> "Monitor the Datadog dashboard for integration activity from the newly enabled workplaces."

## Summary Checklist

| Step                                               | 1-way                 | 2-way                 |
| -------------------------------------------------- | --------------------- | --------------------- |
| Create integration via API (or migration PR)       | ✅                    | ✅                    |
| Flag: `enable-external-integrations`               | ℹ️ enabled by default | ℹ️ enabled by default |
| Flag: `enable-autumn-track-scheduling-integration` | ✅                    | ✅                    |
| Hex data export + share CSV                        | ✅                    | ✅                    |
| Flag: `forge-staff-lion-integration-config`        | ❌                    | ✅                    |
| Verify Datadog dashboard                           | ✅                    | ✅                    |
