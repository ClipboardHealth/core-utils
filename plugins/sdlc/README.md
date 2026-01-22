# Software Development Lifecycle (SDLC) Plugin

SDLC with test-driven development (TDD) methodology.

## Overview

This plugin provides workflow guidance for AI-first development.

## Commands

| Command          | Purpose                              |
| ---------------- | ------------------------------------ |
| `/code <ticket>` | Start TDD implementation of a ticket |

## Skill

The `sdlc` skill provides methodology guidance:

- TDD Red-Green-Refactor cycle
- Spec change protocol (when to pause and confirm)
- Verification checklist (typecheck, lint, test)
- PR description format with evidence bundles

## Document Structure

Features are documented in the repo:

```text
.claude/docs/YYYY-MM-feature-name/
├── product-brief.md      # Problem and success criteria
├── technical-design.md   # Contracts and rollout plan
├── 01-ticket-name.md     # Implementation tickets
└── ...
```

## Usage

```bash
# Start implementing a ticket
/code .claude/docs/2026-01-feature/01-api-contracts.md

# Or describe what to build
/code Add user authentication endpoint
```

The workflow:

1. Read the ticket/understand requirements
2. TDD loop: Red → Green → Refactor → Commit
3. If blocked by unclear spec, pause and ask
4. Verify (typecheck, lint, test) before PR

## Key Principles

- **Test first** — Write the test before implementation
- **Small commits** — One logical change per commit
- **Specs are sacred** — Confirm before modifying specs
- **Verify locally** — All checks pass before PR
- **Human as gate** — PR review is the final approval

## Project Structure

```text
plugins/sdlc/
├── .claude-plugin/
│   └── plugin.json
├── commands/
│   └── code.md
├── skills/
│   └── sdlc/
│       └── SKILL.md
└── README.md
```
