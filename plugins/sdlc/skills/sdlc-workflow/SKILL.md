---
name: SDLC Workflow
description: This skill should be used when the user asks about "AI-first development workflow", "SDLC phases", "product brief structure", "technical design format", "ticket breakdown", "workflow transitions", "docs folder structure", or mentions transitioning between development phases. Provides guidance on the complete AI-first software development lifecycle.
version: 0.1.0
---

# AI-First SDLC Workflow

## Overview

The AI-first SDLC shifts the bottleneck from writing code to specifying intent and verifying quality. This workflow organizes development into distinct phases with specialized agents handling each phase, maintaining separation of concerns.

## Core Principles

1. **Separation of concerns** - Agents cannot validate their own work
2. **Humans as final gate** - Production-affecting actions require approval
3. **Single source of truth** - Documentation lives in repos as markdown
4. **Semi-autonomous operation** - Agents propose actions and wait for approval
5. **Guided TDD** - Encourage test-first development with flexibility

## Workflow Phases

### Phase 1: Product Discovery

**Command:** `/brief`
**Output:** `docs/YYYY-MM-feature/product-brief.md`

Create product briefs with:

- Clear problem statement
- Success criteria (Gherkin scenarios, contract tests)
- Evidence bundle (queries, cited sources)
- Scope boundaries

### Phase 2: Technical Design

**Command:** `/design`
**Output:** `docs/YYYY-MM-feature/technical-design.md`

Draft technical designs specifying:

- Strongly-typed contract boundaries between services/modules
- Error semantics and handling strategies
- Rollout and rollback plans
- Verification spec matching success criteria

Commit design to repo as single source of truth. Link from Linear for tracking.

### Phase 3: Ticket Writing

**Command:** `/tickets`
**Output:** `docs/YYYY-MM-feature/NN-ticket-name.md`

Break designs into small tickets with:

- Order of operations
- Parallel vs. serial dependencies
- Interface/contract tickets prioritized first (enables parallel work)

### Phase 4: Code Writing

**Command:** `/code`
**Agents:** coder, product-manager, code-verifier, critic, code-reviewer

Implement using TDD Red-Green-Refactor:

1. **Red** - Write failing test
2. **Green** - Minimal implementation to pass
3. **Refactor** - Clean up while tests pass
4. **Commit** - Save progress
5. **Repeat** - Next failing test

When feature complete, run verification agents in sequence.

### Phase 5: Code Review

**Command:** `/review`
**Agent:** evidence-bundler

Open PR with:

- Detailed summary linking to design/ticket
- Risk-weighted complexity score
- Focus areas and concerns
- Evidence bundle (screenshots, logs, test results)

### Phase 6: Deploy

**Command:** `/deploy`
**Agent:** deployment-monitor

After approval:

- Merge PR
- Monitor deployment for issues
- Follow rollout plan (feature flags, gradual rollout)
- Propose rollback on error spikes

## Documentation Structure

All documentation follows the pattern:

```
docs/
└── YYYY-MM-feature-name/
    ├── product-brief.md
    ├── technical-design.md
    ├── 01-api-contracts.md
    ├── 02-backend-impl.md
    ├── 03-frontend-impl.md
    └── ...
```

## Phase Transitions

### Brief → Design

Transition when:

- Problem clearly defined
- Success criteria specified
- Stakeholder alignment achieved

### Design → Tickets

Transition when:

- Contracts defined
- Rollout plan approved
- Design committed to repo

### Tickets → Code

Transition when:

- All tickets created
- Dependencies mapped
- Interface tickets prioritized

### Code → Review

Transition when:

- All tests passing
- code-verifier approves
- critic finds no critical issues
- code-reviewer findings addressed

### Review → Deploy

Transition when:

- Human approves PR
- CI checks pass
- Evidence bundle complete

## Agent Coordination

Agents operate semi-autonomously:

- Propose actions with clear reasoning
- Wait for human approval before proceeding
- Delegate when blocked (e.g., coder → product-manager for spec changes)

The spec-drift-detection hook prevents coders from modifying specs/interfaces directly.

## Additional Resources

### Reference Files

For detailed documentation:

- **`references/document-templates.md`** - Templates for briefs, designs, tickets
- **`references/metrics.md`** - DORA metrics and quality guardrails
- **`references/agent-handoffs.md`** - Detailed agent coordination patterns
