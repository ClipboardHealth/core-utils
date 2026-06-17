---
name: write-feature-ticket
description: Use when creating a Linear feature request ticket from conversation context, a brief description, or code/PR analysis — including when context is too thin to draft from.
---

# Write Feature Ticket

Draft Linear feature request tickets that describe what users need and why — never how to implement it. Dispatches to the `interview-feature` skill when context is insufficient to write a clear ticket.

## Process

1. **Assess context** — check what's known from conversation, HLD, PR, or prior investigation
2. **Clarity gate** — does the available context answer: (a) Who is affected? (b) What can't they do? (c) Why does it matter? Is the framing problem-shaped? Are there no invented details?
   - **Yes** → step 3
   - **1-2 factual gaps** (missing repo, unclear who) → ask the user directly. Don't dispatch the full interview for a single missing data point.
   - **Structural problems** (solution-shaped framing, no problem articulated, mostly unknowns) → dispatch `interview-feature` skill. Receive a structured problem brief. Re-check gate against the brief.
   - If `interview-feature` terminates without producing a problem brief (user refused to articulate a problem), abort the ticket process. Inform the user that the ticket cannot be created without a problem statement.
3. **Final validation** — run the checklist below before drafting. This is the ticket skill's own quality check — it doesn't blindly trust upstream context.
4. **Assess scope** — does the problem contain multiple independent user-facing outcomes? If so, decompose into parent + sub-issues, each describing one outcome. Decomposition is about what the user gets, not how the engineer builds it.
5. **Draft** — title + description, structure scaled to complexity (see Ticket Format below)
6. **Self-review** — check every Red Flag below before presenting
7. **Present for review** — show the draft to the user, plus metadata suggestions BELOW the ticket body, separate from the description: the `feature` type label, priority (Urgent/High/Medium/Low/No Priority), relevant team labels, and project when context supports it. Ask for team/assignee.
8. **Resolve labels** — once the team is known, resolve labels against that team's label set (see Labels below): the `feature` type label on the parent and every sub-issue, plus any approved relevant labels. Wait for explicit approval before proceeding.
9. **Create in Linear** — once the user approves (or approves with changes), create the ticket in Linear using the Linear MCP tools. For sub-issues, create parent first, then children linked to it. Apply the resolved labels and any confirmed metadata. NEVER create without user approval.

## Final Validation Checklist

This gate checks the INPUTS before drafting (the Red Flags table below checks the DRAFT after writing). Verify ALL of these. If any fail, bounce back to `interview-feature` or ask the user directly:

| Check                  | Fail condition                                                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Problem is user-facing | Describes an implementation, not a user need                                                                                                       |
| Who is specific        | "Users" without qualification                                                                                                                      |
| Pain point is concrete | "Improve X" without what's wrong today                                                                                                             |
| Impact is articulated  | No reason given for why this matters                                                                                                               |
| No invented details    | Any claim not from the user, research, or conversation                                                                                             |
| Unknowns are explicit  | Gaps filled with plausible-sounding guesses                                                                                                        |
| No solution language   | Context contains implementation details (field names, technology choices, component names) that could leak into the ticket — scrub before drafting |
| Repository documented  | No repo specified                                                                                                                                  |

## Hard Rules

- **Problem-first, solution-never.** Describe what the user needs and why. Never prescribe how to build it. If input contains technical solutions, the interview skill should have already reframed these — if they survived, strip them now. NEVER include a "Proposed Solution", "Approach", "Implementation", or "Technical Details" section.
- **Acceptance criteria = observable outcomes.** Each criterion describes something a user or system can DO or OBSERVE when the work is done. Not implementation steps, not internal system behavior, not database changes.
- **One ticket, one deliverable outcome.** If the problem contains multiple independent user-facing outcomes, decompose into parent + sub-issues — each describing one outcome.
- **Never invent.** If a detail isn't established from the user, research, or conversation, it doesn't go in the ticket. Period.
- **Approval required.** Always present the draft for user review first. Only create the ticket in Linear after the user explicitly approves.
- **Always document the repository.** Every ticket must specify which repo the work belongs in. If the feature spans multiple repos, flag this — it likely needs separate tickets.
- **Always label by type.** Every feature ticket (and each sub-issue) carries the `feature` type label (or the team's closest equivalent — never invent or create a label without the user's say-so). Also suggest relevant team labels for approval. See Labels.
- **Always ask for team/assignee.** Never guess — ask the user.
- **Feature requests only.** Redirect bug reports to `write-bug-ticket`, tech debt to `write-tech-debt-ticket`.

## Ticket Format

**Title:** Short, imperative, describes the CAPABILITY — not the implementation. Under 70 characters. No bracket prefixes.

**Repository:** Always include the repository name in the ticket body. Run `git remote get-url origin | sed 's/\.git$//' | sed 's/.*[:/]\([^/]*\/[^/]*\)$/\1/'` to get the `org/repo` name. For simple features, include as a bold inline label at the end. For complex features, include in `## Context`.

**Simple feature** (single user story, <4 acceptance criteria):
A paragraph stating the problem and who it affects, then acceptance criteria as a checklist, then repository. No section headers.

**Complex feature** (multiple user stories, 4+ AC, or cross-cutting):
Sections as needed:

- `## Problem` — who is affected, what they can't do today, why it matters
- `## Acceptance Criteria` — observable outcomes checklist
- `## Context` — repository, links to HLD, related tickets (linking to technical docs is fine; inlining implementation details is not)
- `## Scope` — in/out, if ambiguity exists

**Sub-issues** (when decomposed):
Each sub-issue follows the same format. Note blocking relationships (e.g., "_Blocked by: [sub-issue title]_").

See reference.md for full examples (good and bad).

## Labels

Every ticket gets its type label plus any relevant team labels. Labels are presented in the metadata block and applied when the user approves the ticket.

**Resolving labels requires the target team.** `list_issue_labels` is team-scoped, so confirm the team (the "Present for review" step) before resolving — suggest the type label by name up front, then resolve it against the team's actual label set once the team is known.

1. **Type label (mandatory).** Fetch the target team's labels (Linear MCP `list_issue_labels` for that team) and apply the one denoting a feature: `feature` if it exists, otherwise the closest existing equivalent (e.g. `feature-request`). Match case-insensitively and accept grouped variants. If no reasonable match exists, ask the user which label to use — NEVER invent a label or create a new one without the user's say-so.
2. **Relevant labels (suggested).** Review the team's other labels (e.g. `product-area`, area) and suggest those that fit this ticket. Apply them only on approval.
3. **Sub-issues.** Each sub-issue carries the same `feature` type label as the parent, plus its own relevant labels.

## Red Flags — Self-Review Before Presenting

This table checks the DRAFT after writing (the Final Validation Checklist above gates the inputs before drafting). If any row applies, fix before presenting.

| Anti-Pattern                                                      | Fix                                                                                       |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| "Proposed Solution" section ("Add a toggle to settings")          | DELETE the section entirely — describe only the problem and desired outcome               |
| Technical suggestions in body ("Use Redis for caching")           | Remove — describe the need, not the solution                                              |
| Implementation steps as AC ("Add a column to the table")          | Rewrite as what the user can do or observe                                                |
| Internal system behavior as AC ("The cron job skips...")          | Rewrite from user perspective — every AC must pass: "Could a non-engineer verify this?"   |
| Implementation constraints as AC ("Persisted at workplace level") | Remove — this is an implementation detail                                                 |
| Vague problem statement ("Improve search")                        | Add who is affected, what they can't do, why it matters                                   |
| Solution-shaped title ("Add GraphQL endpoint for shifts")         | Rewrite as the capability: "Allow filtering shifts by..."                                 |
| Code references in body ("Modify `DailyNotificationCronJob`")     | Remove all code references — describe the behavior change from the user's perspective     |
| Parroting technical input (user says "field X", ticket says it)   | Translate to user-facing language — the ticket reader shouldn't need to know the codebase |
| Invented details                                                  | Remove — if the detail is needed, bounce back to the interview skill                      |
| No decomposition for multi-outcome work                           | Split into parent + sub-issues, each describing one deliverable outcome                   |
| Bracket title prefixes                                            | Describe the capability without brackets                                                  |
| Guessed team assignment                                           | Ask the user — never guess                                                                |
| Missing repository                                                | Include repo name in ticket body — derive from git remote                                 |
| No `feature` type label                                           | Always apply it (or the team's closest equivalent), on the parent and every sub-issue     |
