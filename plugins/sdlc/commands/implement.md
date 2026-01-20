---
description: Implement a ticket using TDD Red-Green-Refactor methodology
argument-hint: <ticket-file or feature description>
---

# Implement: $ARGUMENTS

## Setup

1. **Locate the ticket** (if implementing from a ticket file)
   - Find in `docs/YYYY-MM-feature-name/NN-ticket-name.md`
   - Read acceptance criteria and technical notes
   - Review the technical design for context

2. **Track progress**
   - Use TodoWrite to list acceptance criteria
   - Mark items as you complete them

## Implementation Loop

For each acceptance criterion, follow TDD:

### RED — Write Failing Test

1. Write test describing expected behavior
2. Run: npx nx run PROJECT:test
3. Confirm test fails for the right reason

### GREEN — Make It Pass

1. Write simplest code to pass the test
2. Run: npx nx run PROJECT:test
3. Confirm test passes

### REFACTOR — Clean Up

1. Improve code quality
2. Run: npx nx run PROJECT:test
3. Confirm tests still pass

### COMMIT — Save Progress

```bash
1. git add <files>
2. git commit -m "feat(scope): description

Refs: docs/YYYY-MM-feature/NN-ticket.md"
```

### REPEAT

Move to next acceptance criterion.

## If Blocked

If the spec is unclear or needs changes:

1. **Stop** — Don't guess or modify specs yourself
2. **Explain** — Describe what's blocking you
3. **Propose** — Suggest the spec change needed
4. **Wait** — Get user approval before proceeding

## When Complete

Run full project-specific verification.

## Output

- Implementation following TDD
- Tests covering acceptance criteria
- Conventional commits referencing ticket
- Ready for PR
