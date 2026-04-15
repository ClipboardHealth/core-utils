---
name: write-tech-debt-ticket
description: Use when creating a Linear tech debt ticket while working in the codebase — from code review, PR comments, codebase audits, or post-incident findings. Expects deep technical context; classifies debt, assesses interest/risk with evidence, and justifies impact.
---

# Write Tech Debt Ticket

Draft Linear tech debt tickets that justify _why_ the debt matters — cost to carry, risks, and what happens if left unaddressed. Every claim backed by code references and data.

**This is NOT a refactoring task.** It documents the _case_ for prioritization — cost of inaction, not a how-to guide.

> Debt not well-understood yet (vague complaint, unclear cost)? Use `investigate-ticket` first. If the conversation already has investigation findings, use them — don't re-ask.

## Process

1. **Gather context** — from code, PR comment, conversation, or audit. Note how the debt was discovered (see Discovery Context below).
2. **Analyze the code** — read the actual code. Understand what it does and why it qualifies as debt.
3. **Classify** — pick a primary debt type (and optional secondary) from classification table in reference.md
4. **Gather evidence** (driven by classification):
   - Performance/Scalability/Reliability → search Datadog (NOT optional for these types)
   - Maintainability/DX → `git log` for change frequency and bug-fix commits, grep for workarounds
   - Security → check dependency versions, scan for vulnerability patterns
5. **Assess interest & risk** — produce structured ratings with evidence (see reference.md for rating framework)
6. **Check for duplicates** — follow the `linear-duplicate-finder` process (read its [SKILL.md](../linear-duplicate-finder/SKILL.md)). Generate search queries from the debt's key terms, component names, and domain area. If duplicates are found, present them to the user before proceeding.
7. **Draft** — title + description, structure scaled to complexity (see format below)
8. **Self-review** — check every Red Flag below before presenting
9. **Present for review** — show ONLY the draft and metadata suggestions. Ask for team/assignee.
10. **Create in Linear** — only after explicit approval. Apply `technical-debt` label.

## Hard Rules

- **Debt ticket, not refactoring task.** Document the cost. NEVER include "Proposed Solution", "Suggested Approach", "Suggested Fix", "Acceptance Criteria", or implementation steps. You may describe _ideal state_ (destination) but NOT steps to get there.
- **"Impact If Left Unaddressed" is MANDATORY.** What happens in 3-6 months if nobody fixes this? Without this, the ticket is just a complaint.
- **Always read the code.** Every claim backed by a code reference or data. No vibes.
- **Justify every rating.** Cite git history, Datadog data, or workaround examples.
- **Datadog is mandatory for Performance/Reliability/Scalability.** Conditional for other types.
- **Code references always.** File paths and line numbers in every ticket.
- **Clean titles.** No bracket prefixes. Describe the debt. Under 70 characters.
- **Never invent.** Every claim must be backed by code you read, data you found, or context from the conversation. If you can't find evidence for an assertion, don't include it — even if it seems plausible.
- **One ticket, one concern.** If the debt spans multiple independent problems (e.g., a performance issue AND a maintainability issue in the same service), split into separate tickets — each with its own classification, evidence, and impact. Related debt can reference each other.
- **Always document the repository.** Flag multi-repo debt to the user for splitting.
- **Redirect non-debt.** Bugs → `write-bug-ticket`, features → `write-feature-ticket`.

## Ticket Format

**Title:** Describes the debt, not the fix. Under 70 characters. No bracket prefixes.

**Repository:** Always include the repository name in the ticket body. Run `git remote get-url origin | sed 's/\.git$//' | sed 's/.*[:/]\([^/]*\/[^/]*\)$/\1/'` to get the `org/repo` name. For simple debt, include as a bold inline label. For complex debt, include in `## What Is The Debt`.

**Discovery Context:** If the debt was discovered while working on a specific ticket, PR, or incident, include that context so reviewers understand how it surfaced. For simple debt, add a sentence (e.g., "Discovered while working on [TICKET-123](link)."). For complex debt, include a `## Discovery Context` section with the originating ticket/PR link and a brief note on how the work revealed the debt. Omit this section only if the debt was found through a standalone audit with no originating ticket.

**Simple debt** (single location, clear impact): A paragraph with classification, repository, code references, discovery context (if applicable), and "Impact If Left Unaddressed" inline.

**Complex debt** (multi-file, systemic, high-stakes): Use `## What Is The Debt` (include repository), `## Discovery Context` (if applicable — originating ticket/PR and how the work revealed the debt), `## Debt Classification` (type + rated interest/risk with justifications), `## Code References`, `## Evidence`, `## Ideal State` (destination, not route), `## Impact If Left Unaddressed`.

**Metadata:** Priority, labels (`technical-debt`), presented BELOW the body. Always ask for team/assignee.

See reference.md for classification tables, rating framework, and full examples.

## Red Flags — Self-Review Before Presenting

| Anti-Pattern                      | Fix                                                       |
| --------------------------------- | --------------------------------------------------------- |
| Reads like a refactoring task     | Rewrite to document the cost of the debt, not the fix     |
| Has "Proposed Solution" section   | Delete. Describe ideal state instead.                     |
| Has "Suggested Approach" section  | Delete. Describe ideal state instead.                     |
| Has "Acceptance Criteria"         | Delete. This is a debt ticket, not a task.                |
| No code references                | Add specific file paths and line numbers                  |
| Unjustified ratings               | Cite git frequency, Datadog data, or workaround examples  |
| Aesthetic complaints as debt      | Explain the concrete cost or don't file the ticket        |
| No "Impact If Left Unaddressed"   | Always include — this gets the ticket prioritized         |
| No Datadog for perf/reliability   | You MUST search Datadog for these types                   |
| Forced Datadog on maintainability | Only for performance/reliability/scalability              |
| Guessed team assignment           | Ask the user                                              |
| Missing repository                | Include repo name in ticket body — derive from git remote |
| Missing discovery context         | If debt was found during ticket/PR work, link it          |
