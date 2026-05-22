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

### Step 1: Create Migration PR

Create a migration file at `src/migrations/<date>-add-external-integration-config-autumn-track.ts` following the pattern from [PR #15144](https://github.com/ClipboardHealth/clipboard-health/pull/15144).

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

> ⚠️ **Wait for the migration PR from Step 1 to be merged and deployed before proceeding.**

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

- **Flag**: `2025-05-forge-staff-lion-integration-config`
- **Project**: `default`
- **Environment**: `production`
- Add each workplace ID to the `production` variable of this flag.

Use the LaunchDarkly MCP to update the flag.

### Step 6: Verify

After enabling, check the [Datadog integration dashboard](https://app.datadoghq.com/dashboard/smr-hbh-bcd) to confirm logs are flowing for the enabled facilities.

Tell the user:

> "Monitor the Datadog dashboard for integration activity from the newly enabled workplaces."

## Summary Checklist

| Step                                                          | 1-way                 | 2-way                 |
| ------------------------------------------------------------- | --------------------- | --------------------- |
| Migration PR                                                  | ✅                    | ✅                    |
| Flag: `2024-11-21-enable-external-integrations`               | ℹ️ enabled by default | ℹ️ enabled by default |
| Flag: `2024-11-27-enable-autumn-track-scheduling-integration` | ✅                    | ✅                    |
| Hex data export + share CSV                                   | ✅                    | ✅                    |
| Flag: `2025-05-forge-staff-lion-integration-config`           | ❌                    | ✅                    |
| Verify Datadog dashboard                                      | ✅                    | ✅                    |
