---
description: AI-First SDLC workflow with TDD methodology. Use when implementing features, writing tests, or following the development lifecycle.
---

# AI-First Software Development Lifecycle

AI moves the bottleneck from writing code to specifying intent and verifying quality.

## Workflow Overview

1. **Product Brief** → Clear problem statement and success criteria
2. **Technical Design** → Contracts, rollout plan, verification spec
3. **Tickets** → Small, ordered implementation units
4. **Implementation** → TDD Red-Green-Refactor
5. **Verification** → Type check, lint, test, edge cases
6. **Review** → PR with evidence bundle
7. **Deploy** → Monitor and manage rollout

## Document Structure

All feature documentation lives in the repo:

```text
docs/YYYY-MM-feature-name/
├── product-brief.md      # Problem, success criteria, evidence
├── technical-design.md   # Contracts, rollout plan, verification spec
├── 01-ticket-name.md     # First implementation ticket
├── 02-ticket-name.md     # Second ticket
└── ...
```

## TDD Red-Green-Refactor

For each piece of functionality:

### RED: Write a Failing Test

1. Identify the next acceptance criterion
2. Write a test describing expected behavior
3. Run the test — confirm it fails
4. Verify failure is for the right reason (not syntax error)

### GREEN: Make It Pass

1. Write the simplest code to make the test pass
2. Avoid premature optimization
3. Focus only on the current test
4. Run the test — confirm it passes

### REFACTOR: Clean Up

1. Improve code structure and readability
2. Remove duplication
3. Improve naming
4. Run tests after each change — keep them green

### COMMIT: Save Progress

1. Stage relevant changes
2. Write conventional commit message referencing the ticket
3. Move to next acceptance criterion

## Spec Change Protocol

**Before editing these files, confirm with the user:**

- `product-brief.md`
- `technical-design.md`
- Interface/contract files (`interface.ts`, `contracts.ts`)
- Acceptance criteria in tickets

If implementation reveals a spec gap or ambiguity:

1. **Stop** implementing
2. **Explain** what's unclear or needs to change
3. **Propose** the spec change with rationale
4. **Wait** for user approval
5. **Update** the spec, then resume implementation

## Verification Checklist

Run full project-specific verification. It must pass. Fix any failures before proceeding.

## Evidence Bundle

For non-trivial changes, collect evidence:

- **Before/after screenshots** (for UI changes)
- **API request/response examples** (for API changes)
- **Test output** showing coverage of acceptance criteria
- **Performance metrics** (if relevant)

Include evidence links in the PR description.

## PR Description Format

```markdown
## Summary

[1-3 bullet points explaining the change]

Implements: docs/YYYY-MM-feature/NN-ticket-name.md
Design: docs/YYYY-MM-feature/technical-design.md

## Changes

- [List of key changes]

## Verification

- [ ] Type check passes
- [ ] Lint passes
- [ ] Tests pass
- [ ] Acceptance criteria met

## Evidence

[Links to screenshots, logs, or test output]

## Risk Assessment

[Low/Medium/High] - [Brief explanation]

## Rollout Plan

[How this will be deployed - feature flag, gradual rollout, etc.]
```

## Key Principles

1. **Test first** — Write the test before the implementation
2. **Small commits** — One logical change per commit
3. **Specs are sacred** — Don't modify without approval
4. **Verify before PR** — All checks must pass locally
5. **Evidence over assertions** — Show, don't tell
