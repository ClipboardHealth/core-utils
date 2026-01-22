---
description: Implement a ticket using TDD Red-Green-Refactor methodology
argument-hint: <ticket-file or feature description>
---

# Implement: $ARGUMENTS

## Setup

1. **Locate the ticket** (if implementing from a ticket file)
   - Find in `.claude/docs/YYYY-MM-feature-name/NN-ticket-name.md`
   - Read acceptance criteria and technical notes
   - Review the technical design for context

2. **Track progress**
   - Use TodoWrite to list acceptance criteria
   - Mark items as you complete them

## Implementation loop

For each acceptance criterion, follow TDD:

### Red: Write a failing test

1. Write a test describing expected behavior for the next acceptance criterion
2. Run the test, confirm it fails for the right reason (e.g., not syntax error)

### Green: Make it pass

1. Write the simplest code to make the test pass, avoiding premature optimization
2. Run the test, confirm it passes

### Refactor: Clean up

1. Spawn a code-simplifier:code-simplifier agent to improve code structure and readability (e.g., remove duplication, improve naming)
2. Run tests after each change, keep them green

### Commit: Save progress

1. Commit changes with conventional commit message referencing the ticket

   ```bash
   1. git add <files>
   2. git commit -m "feat(scope): description

   Refs: .claude/docs/YYYY-MM-feature/NN-ticket.md"
   ```

2. Move to next acceptance criterion

## If blocked

If the spec is unclear or needs changes:

1. **Stop** — Don't guess or modify specs yourself
2. **Explain** — Describe what's blocking you
3. **Propose** — Suggest the spec change needed
4. **Wait** — Get user approval before proceeding

## When complete

Run full project-specific verification.

## Output

- Implementation following TDD
- Tests covering acceptance criteria
- Conventional commits referencing ticket
- Ready for PR
