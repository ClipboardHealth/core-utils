---
name: write-feature-ticket
description: Use when creating a Linear feature request ticket from conversation context, a brief description, or code/PR analysis. Guides through problem clarification before drafting.
---

# Write Feature Ticket

Draft Linear feature requests that describe what users need and why — never how to implement it. Acceptance criteria are observable outcomes, not implementation steps.

> Stems from a production issue or unclear problem? Use `investigate-ticket` first. If the conversation already has investigation findings, use them — don't re-ask.

## Process

1. **Gather context** — assess what's known from conversation, code, or input
2. **Clarify (conditional)** — if missing ANY of: (a) who is affected, (b) what they can't do today, (c) why it matters — ask before drafting. NEVER invent answers. Up to 3 rounds.
3. **Assess scope** — can this be done in one PR? If not, plan parent + sub-issues with blocking relationships.
4. **Draft** — title + description, structure scaled to complexity (see format below)
5. **Present for review** — show draft + metadata suggestions. Wait for explicit approval.
6. **Create in Linear** — only after approval. For complex tickets, create parent first, then linked sub-issues.

## Hard Rules

- **Problem-first, solution-never.** Describe what the user needs. NEVER include "Proposed Solution", "Approach", "Implementation", or "Technical Details" sections. Reframe technical input as the underlying problem.
- **AC = observable outcomes.** Each criterion: something a user or system can DO or OBSERVE. Not implementation steps, not internal behavior, not database changes. Test: "Could a non-engineer verify this?"
- **One ticket, one PR.** Multi-PR work → parent + sub-issues with blocking relationships.
- **Clean titles.** Imperative, describes the CAPABILITY not the implementation. Under 70 characters.
- **Always document the repository.** Flag multi-repo features to the user for splitting.
- **Redirect non-features.** Bugs → `write-bug-ticket`, tech debt → `write-tech-debt-ticket`.

## Ticket Format

**Title:** Imperative, describes the CAPABILITY. Under 70 characters.

**Simple feature** (<4 AC): A paragraph stating the problem, then AC as a checklist. No section headers.

**Complex feature** (4+ AC, cross-cutting): Use `## Problem`, `## Acceptance Criteria`, `## Context` (links to HLD/related tickets), `## Scope` (in/out).

**Sub-issues:** Same format. Note blocking relationships ("_Blocked by: [title]_").

See reference.md for full examples.

## Red Flags — Self-Review Before Presenting

| Anti-Pattern                       | Fix                                                                |
| ---------------------------------- | ------------------------------------------------------------------ |
| "Proposed Solution" section        | DELETE entirely. Describe only the problem and desired outcome.    |
| Technical suggestions in body      | Remove — describe the need, not the solution                       |
| Implementation steps as AC         | Rewrite as what the user can do or observe                         |
| Internal system behavior as AC     | Rewrite from user perspective. "Could a non-engineer verify this?" |
| Vague problem statement            | Add who is affected, what they can't do, why it matters            |
| Solution-shaped title              | Rewrite as the capability: "Allow filtering shifts by..."          |
| Code references in body            | Remove. Describe the behavior change from the user's perspective.  |
| No decomposition for multi-PR work | Split into parent + sub-issues with blocking relationships         |
