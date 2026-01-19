---
description: Start TDD implementation of a ticket using Red-Green-Refactor
argument-hint: [ticket-file or ticket-number]
allowed-tools: Read, Write, Edit, Grep, Glob, Bash(*), Task, AskUserQuestion, TodoWrite
---

# TDD Implementation

Implement ticket: $ARGUMENTS

## Process

1. **Locate and read the ticket**
   - Find ticket in `docs/YYYY-MM-feature-name/`
   - Read acceptance criteria and technical notes
   - Understand dependencies and test requirements

2. **Set up implementation tracking**
   - Use TodoWrite to track acceptance criteria
   - Mark items in_progress as you work
   - Mark completed when tests pass

3. **Implement using TDD Red-Green-Refactor**

   For each acceptance criterion:

   **RED**: Write a failing test
   - Write test that describes expected behavior
   - Run test to confirm it fails
   - Verify failure is for the right reason

   **GREEN**: Write minimal implementation
   - Write simplest code to make test pass
   - Avoid premature optimization
   - Run test to confirm it passes

   **REFACTOR**: Improve the code
   - Clean up implementation
   - Remove duplication
   - Improve naming
   - Run tests to confirm still passing

   **COMMIT**: Save progress
   - Commit after each complete cycle
   - Use conventional commit messages
   - Reference ticket in commit

   **REPEAT**: Continue with next test

4. **Handle blockers**
   - If spec is unclear or needs changes, STOP
   - Propose delegation to product-manager agent
   - Do NOT modify specs or interfaces directly
   - Wait for human approval to proceed

5. **When feature complete**
   - All acceptance criteria met
   - All tests passing
   - Propose handoff to code-verifier agent

## Agent Boundaries

The coder agent CAN:

- Write and run tests
- Write implementation code
- Refactor code
- Commit changes

The coder agent CANNOT:

- Modify specs, tickets, or interfaces
- Change acceptance criteria
- Make architectural decisions outside ticket scope

If blocked, delegate to product-manager agent.

## Output

- Implementation code following TDD
- Tests covering all acceptance criteria
- Commits with clear messages
- Ready for verification chain

## Next Steps

After implementation:

- Handoff to code-verifier for type check, lint, tests
- Then to critic for edge case testing
- Then to code-reviewer for local review
- Finally to `/review` to open PR

Use the tdd-patterns skill for TDD methodology guidance.
