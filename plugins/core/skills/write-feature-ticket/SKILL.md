---
name: write-feature-ticket
description: Use when creating a Linear feature request ticket from conversation context, a brief description, or code/PR analysis. Guides through problem clarification before drafting.
---

# Write Feature Ticket

Draft Linear feature request tickets that describe what users need and why — never how to implement it. Acceptance criteria are observable outcomes, not implementation steps. Each ticket should be completable in a single PR; decompose into sub-issues when work spans backend + frontend or requires sequenced steps.

## Process

1. **Gather context** — assess what's known from conversation, code, or input
2. **Clarify (conditional)** — if the input doesn't clearly answer ALL THREE of these questions, you MUST ask before drafting: (a) Who is affected? (b) What can't they do today? (c) Why does it matter? Ask up to 3 rounds (one question per message). NEVER invent answers to these questions — if you don't know, ask. Skip only when context is genuinely sufficient (HLD, detailed conversation, thorough description that covers all three).
3. **Assess scope** — can this be done in one PR? If not, plan parent + sub-issues with blocking relationships
4. **Draft** — title + description, structure scaled to complexity
5. **Suggest metadata (conditional)** — priority (Urgent/High/Medium/Low/No Priority), labels, project when context supports it. Present metadata suggestions BELOW the ticket body, separate from the description.
6. **Present for review** — show the draft to the user. Wait for explicit approval before proceeding.
7. **Create in Linear** — once the user approves (or approves with changes), create the ticket in Linear using the Linear MCP tools. For complex tickets with sub-issues, create the parent first, then sub-issues linked to it. Apply any suggested metadata the user confirmed. NEVER create in Linear without user approval.

## Hard Rules

- **Problem-first, solution-never.** Describe what the user needs and why. Never prescribe how to build it. If the user's input contains technical solutions, reframe as the underlying problem. NEVER include a "Proposed Solution", "Approach", "Implementation", or "Technical Details" section.
- **Acceptance criteria = observable outcomes.** Each criterion describes something a user or system can DO or OBSERVE when the work is done. Not implementation steps, not internal system behavior, not database changes.
- **One ticket, one PR.** If work requires multiple PRs (backend + frontend, sequenced migrations, independent workstreams), create a parent ticket with sub-issues. Note blocking relationships explicitly.
- **Feature requests only.** Redirect bug reports to `write-bug-ticket`, tech debt to `write-tech-debt-ticket`.
- **Approval required.** Always present the draft for user review first. Only create the ticket in Linear after the user explicitly approves. If the user requests changes, revise and re-present before creating.

## Ticket Format

**Title:** Short, imperative, describes the CAPABILITY — not the implementation. Under 70 characters.

**Simple feature** (single user story, <4 acceptance criteria):
A paragraph stating the problem and who it affects, then acceptance criteria as a checklist. No section headers.

**Complex feature** (multiple user stories, 4+ AC, or cross-cutting):
Sections as needed:

- `## Problem` — who is affected, what they can't do today, why it matters
- `## Acceptance Criteria` — observable outcomes checklist
- `## Context` — links to HLD, related tickets (linking to technical docs is fine; inlining implementation details is not)
- `## Scope` — in/out, if ambiguity exists

**Sub-issues** (when decomposed):
Each sub-issue follows the same format. Note blocking relationships (e.g., "_Blocked by: [sub-issue title]_").

## Red Flags — Self-Review Before Presenting

Before showing the draft, check for every one of these violations and fix them:

| Anti-Pattern                       | Example                                                                       | Fix                                                                                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| "Proposed Solution" section        | "Add a toggle to the settings panel"                                          | DELETE the section entirely. Describe only the problem and desired outcome.                                                                    |
| Technical suggestions in body      | "Use Redis for caching"                                                       | Remove — describe the need, not the solution                                                                                                   |
| Implementation steps as AC         | "Add a column to the table"                                                   | Rewrite as what the user can do or observe                                                                                                     |
| Internal system behavior as AC     | "The cron job skips workplaces where...", "The API exposes a setting that..." | Rewrite from user perspective: "Workplaces with X disabled do not receive..." Every AC must pass the test: "Could a non-engineer verify this?" |
| Implementation constraints as AC   | "Setting is persisted at workplace level"                                     | Remove — this is an implementation detail                                                                                                      |
| Vague problem statement            | "Improve search"                                                              | Add who is affected, what they can't do, why it matters                                                                                        |
| Solution-shaped title              | "Add GraphQL endpoint for shifts"                                             | Rewrite as the capability: "Allow filtering shifts by..."                                                                                      |
| Code references in body            | "Modify `DailyNotificationCronJob`"                                           | Remove all code references. Describe the behavior change from the user's perspective.                                                          |
| Parroting technical input          | User says "field X", ticket says "field X"                                    | Translate to user-facing language. The ticket reader shouldn't need to know the codebase.                                                      |
| No decomposition for multi-PR work | Backend + frontend in one ticket                                              | Split into parent + sub-issues with blocking relationships                                                                                     |

## Examples

Based on real ticket TG-3228 to show the contrast.

### What NOT to write (anti-pattern)

> **Title:** Disable Interview List (Daily Digest) Per Workplace
>
> **Approach:** Add `interviewListEnabled` boolean to interview settings. Gate the `DailyNotificationCronJob` on the new setting. Migration to disable for phone-interview workplaces. Admin UI toggle for manual control.

This prescribes implementation (field names, specific cron job, migration strategy) and mixes what with how.

### Simple Ticket

**Title:** Allow workplaces to disable the daily interview digest

Workplaces using phone interviews receive a daily interview digest email that isn't relevant to their workflow. There is no way to turn it off — the digest is sent to all workplaces regardless of their interview type.

**Acceptance Criteria:**

- [ ] An employee admin can enable or disable the daily interview digest for a workplace
- [ ] Workplaces using phone interviews do not receive the digest by default
- [ ] When a workplace switches to phone interviews, the digest is automatically disabled

### Complex Ticket (with sub-issues)

**Parent — Title:** Allow workplaces to disable the daily interview digest

#### Problem

Workplaces using phone interviews receive a daily interview digest email that isn't relevant to their workflow. There is no way to turn it off — the digest is sent to all workplaces regardless of their interview type. Employee admins need a way to control this per workplace.

#### Acceptance Criteria

- [ ] An employee admin can enable or disable the daily interview digest for a workplace
- [ ] The digest is not sent to workplaces that have it disabled
- [ ] Workplaces using phone interviews have the digest disabled by default
- [ ] When a workplace switches to phone interviews, the digest is automatically disabled
- [ ] Only employee admins can change this setting (not workplace admins)

#### Scope

- **In:** Per-workplace toggle, auto-disable for phone interview workplaces
- **Out:** Per-user digest preferences, other notification types

#### Sub-issues

**Sub-issue 1 — Title:** Support per-workplace interview digest setting and auto-disable logic

The system should support a per-workplace setting to control the daily interview digest, and the digest should respect this setting.

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
