# Ticket Examples

Based on real ticket TG-3228 to show the contrast.

## What NOT to write (anti-pattern)

> **Title:** Disable Interview List (Daily Digest) Per Workplace
>
> **Approach:** Add `interviewListEnabled` boolean to interview settings. Gate the `DailyNotificationCronJob` on the new setting. Migration to disable for phone-interview workplaces. Admin UI toggle for manual control.

This prescribes implementation (field names, specific cron job, migration strategy) and mixes what with how.

## Simple Ticket

**Title:** Allow workplaces to disable the daily interview digest

Workplaces using phone interviews receive a daily interview digest email that isn't relevant to their workflow. There is no way to turn it off — the digest is sent to all workplaces regardless of their interview type.

**Acceptance Criteria:**

- [ ] An employee admin can enable or disable the daily interview digest for a workplace
- [ ] Workplaces using phone interviews do not receive the digest by default
- [ ] When a workplace switches to phone interviews, the digest is automatically disabled

**Repository:** clipboard-health/clipboard-api

## Complex Ticket (with sub-issues)

**Parent — Title:** Allow workplaces to disable the daily interview digest

### Problem

Workplaces using phone interviews receive a daily interview digest email that isn't relevant to their workflow. There is no way to turn it off — the digest is sent to all workplaces regardless of their interview type. Employee admins need a way to control this per workplace.

### Acceptance Criteria

- [ ] An employee admin can enable or disable the daily interview digest for a workplace
- [ ] The digest is not sent to workplaces that have it disabled
- [ ] Workplaces using phone interviews have the digest disabled by default
- [ ] When a workplace switches to phone interviews, the digest is automatically disabled
- [ ] Only employee admins can change this setting (not workplace admins)

### Context

**Repository:** clipboard-health/clipboard-api

### Scope

- **In:** Per-workplace toggle, auto-disable for phone interview workplaces
- **Out:** Per-user digest preferences, other notification types

### Sub-issues

**Sub-issue 1 — Title:** Support per-workplace interview digest control

The system should allow per-workplace control over the daily interview digest, and the digest should respect this setting.

**Acceptance Criteria:**

- [ ] A per-workplace setting controls whether the daily interview digest is sent
- [ ] The digest is not sent to workplaces that have it disabled
- [ ] Existing phone-interview workplaces have the digest disabled
- [ ] Switching to phone interviews automatically disables the digest

---

**Sub-issue 2 — Title:** Add admin UI for interview digest setting
_Blocked by: Sub-issue 1_

Employee admins need a way to manually enable or disable the daily interview digest for a workplace.

**Acceptance Criteria:**

- [ ] Employee admins can toggle the interview digest setting from workplace settings
- [ ] The toggle is not visible to non-employee-admin roles
- [ ] The toggle reflects the current state of the setting

**Suggested metadata:** Priority: Medium | Team: Team Gaia
