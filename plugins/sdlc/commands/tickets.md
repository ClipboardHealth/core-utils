---
description: Break down technical design into small, ordered tickets
argument-hint: [feature-name or 'based on design']
allowed-tools: Read, Write, Edit, Grep, Glob, Bash(git:*), Task, AskUserQuestion
---

# Ticket Creation

Create tickets for: $ARGUMENTS

## Process

1. **Locate the technical design**
   - Find the design in `docs/YYYY-MM-feature-name/`
   - Read and understand the contracts and scope
   - If no design exists, recommend running `/design` first

2. **Identify work items**
   - List all implementation tasks from design
   - Identify shared contracts/interfaces
   - Group by parallel vs serial dependencies

3. **Prioritize interface tickets**
   - Interface/contract tickets come first (e.g., `01-api-contracts.md`)
   - Committing interfaces early enables parallel work
   - Backend and frontend can work simultaneously

4. **Create tickets** with structure:
   - Ticket number prefix: `NN-ticket-slug.md`
   - Type: Interface | Backend | Frontend | Infrastructure | Testing
   - Dependencies: Which tickets must complete first
   - Blocks: Which tickets depend on this one
   - Parallel Group: A, B, C for parallel work streams
   - Description: Clear implementation description
   - Acceptance Criteria: Specific, testable criteria
   - Technical Notes: Implementation hints, patterns
   - Test Requirements: Unit and integration test cases
   - Definition of Done: Checklist for completion

5. **Map dependencies**
   - Create dependency graph
   - Identify critical path
   - Mark parallel groups

6. **Review ticket sizes**
   - Each ticket should be completable in 1-2 sessions
   - Split large tickets
   - Combine trivially small tickets

## Example Structure

```
docs/YYYY-MM-feature-name/
├── product-brief.md
├── technical-design.md
├── 01-api-contracts.md      # Interface (first priority)
├── 02-database-schema.md    # Backend (depends on 01)
├── 03-backend-service.md    # Backend (depends on 01, 02)
├── 04-frontend-components.md # Frontend (depends on 01)
└── 05-integration-tests.md  # Testing (depends on 03, 04)
```

## Output

Save tickets to `docs/YYYY-MM-feature-name/NN-ticket-slug.md` following the template in the sdlc-workflow skill.

## Important

- Tickets live in repo as single source of truth
- Link from Linear for tracking
- Keep tickets small and focused
- Interface tickets enable parallelism

## Next Steps

After creating tickets:

- Human reviews ticket breakdown
- Create Linear issues linked to markdown files
- Begin implementation with `/code` command
- Start with interface tickets first

Use the sdlc-workflow skill for ticket templates and workflow guidance.
