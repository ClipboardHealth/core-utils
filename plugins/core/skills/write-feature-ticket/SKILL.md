---
name: write-feature-ticket
description: Use when creating a Linear feature request ticket from conversation context, a brief description, or code/PR analysis. Interviews the user for clarity when context is insufficient.
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
3. **Check for duplicates** — follow the `linear-duplicate-finder` process (read its [SKILL.md](../linear-duplicate-finder/SKILL.md)). Generate search queries from the problem's key terms, affected users, and domain area. If duplicates or closely related tickets are found, present them to the user and ask whether to proceed, merge with an existing ticket, or stop.
4. **Final validation** — run the checklist below before drafting. This is the ticket skill's own quality check — it doesn't blindly trust upstream context.
5. **Assess scope** — does the problem contain multiple independent user-facing outcomes? If so, decompose into parent + sub-issues, each describing one outcome. Decomposition is about what the user gets, not how the engineer builds it.
6. **Draft** — title + description, structure scaled to complexity (see Ticket Format below)
7. **Self-review** — check every item in [red-flags.md](red-flags.md) before presenting
8. **Suggest metadata (conditional)** — priority (Urgent/High/Medium/Low/No Priority), labels, project when context supports it. Present metadata suggestions BELOW the ticket body, separate from the description.
9. **Present for review** — show the draft to the user. Wait for explicit approval before proceeding.
10. **Create in Linear** — once the user approves (or approves with changes), create the ticket in Linear using the Linear MCP tools. For sub-issues, create parent first, then children linked to it. Apply any confirmed metadata. NEVER create without user approval.

## Final Validation Checklist

Before drafting, verify ALL of these. If any fail, bounce back to `interview-feature` or ask the user directly:

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
- **Feature requests only.** Redirect bug reports to `write-bug-ticket`, tech debt to `write-tech-debt-ticket`.

## Ticket Format

**Title:** Short, imperative, describes the CAPABILITY — not the implementation. Under 70 characters.

**Repository:** Always include the repository name (e.g., `clipboard-health/core-utils`) in the ticket body. Determine the repo from the current working directory's git remote (`git remote get-url origin`). For simple features, include as a bold inline label at the end. For complex features, include in `## Context`.

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

**For self-review anti-patterns**, see [red-flags.md](red-flags.md).
**For ticket examples** (good and bad), see [examples.md](examples.md).
