---
description: SDLC workflow with test-driven development methodology. Use when implementing features, writing tests, or following the development lifecycle.
---

# Software development lifecycle (SDLC)

## Workflow overview

1. **Product Brief** → Clear problem statement and success criteria
2. **Technical Design** → Contracts, rollout plan, verification spec
3. **Tickets** → Small, ordered implementation units
4. **Implementation** → TDD Red-Green-Refactor
5. **Verification** → Type check, lint, test, edge cases, review with evidence bundle
6. **Deploy** → Monitor and manage rollout

## Document structure

All feature documentation lives in the repo:

```text
.claude/docs/YYYY-MM-<feature>/
├── product-brief.md      # Problem, success criteria, evidence
├── technical-design.md   # Contracts, rollout plan, verification spec
├── 01-ticket-name.md     # First implementation ticket
├── 02-ticket-name.md     # Second ticket
└── ...
```

## TDD: Red-green-refactor loop

For each piece of functionality:

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
2. Move to next acceptance criterion

## Spec change protocol

**Before editing the following files, confirm with the user:**

- `product-brief.md`
- `technical-design.md`
- Interface/contract files (e.g., `<feature>.contract.ts`)
- Acceptance criteria in tickets

If implementation reveals a spec gap or ambiguity:

1. **Stop** implementing
2. **Explain** what's unclear or needs to change
3. **Propose** the spec change with rationale
4. **Wait** for user approval
5. **Update** the spec, then resume implementation

## Verification checklist

Run full project-specific verification. It must pass. Fix any failures before proceeding.

## Evidence bundle

For non-trivial changes, collect evidence:

- **Before/after screenshots** (for UI changes)
- **API request/response examples** (for API changes)
- **Test output** showing coverage of acceptance criteria
- **Performance metrics** (if relevant)

Include evidence links in the PR description.

## PR description format

```markdown
# Summary

[1-3 bullet points explaining the change]

Implements: .claude/docs/YYYY-MM-<feature>/NN-ticket-name.md
Technical design: .claude/docs/YYYY-MM-<feature>/technical-design.md

## Changes

- [List of key changes]

## Videos/screenshots

[Links to screenshots, logs, or test output validating acceptance criteria]

## Risk assessment

[Low/Medium/High] - [Brief explanation]

## Rollout plan

[How this will be deployed - feature flag, gradual rollout, etc.]
```

## Key Principles

1. **Test first** — Write the test before the implementation
2. **Small commits** — One logical change per commit
3. **Specs are sacred** — Don't modify without approval
4. **Verify before PR** — All checks must pass locally
5. **Evidence over assertions** — Show, don't tell
