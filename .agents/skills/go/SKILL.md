---
description: Implement a plan file or direct request end-to-end, then hand off to commit-push-pr to ship it. Use when the user says 'go', 'execute the plan', 'implement the plan', or gives an implementation request.
---

# Go: Execute Work and Ship It

Given a plan file or direct implementation request, implement the requested work, then invoke the `commit-push-pr` skill to create a PR.

This skill is the bridge between intent and shipping. It does not re-plan or re-design unless the user asked for that. If the request is wrong or cannot be implemented safely, surface that; do not silently improvise.

## Phase 1: Resolve the Input

The user invokes this skill with either a plan file path/identifier or a direct request like "add a login button."

- **Path-like input** (absolute, relative, or bare name): try to read it. For bare names, check the host's plans directory first. Resolve the path first; if it lies outside the workspace/repo or the host's plans directory, ask the user to confirm before reading it (applies to both absolute and relative inputs — `..` escapes count). If the input doesn't resolve to a readable file, stop and tell the user — do not reinterpret a missing path as a direct request.
- **Natural-language request**: treat as the implementation task. There may be no plan file.
- **No argument**: ask for either a plan path or the implementation request.

When using a plan, read it fully before starting. Note **Critical files**, **Approach**, and **Verification** sections (or equivalents).

## Phase 2: Implement

The plan or request is the source of truth for scope:

- Make exactly the changes requested — no extra refactors, tests, or cleanup.
- If the plan references files or utilities that no longer exist, stop and report.
- If an assumption is invalid or a constraint was missed, stop and report. Do not silently rewrite the approach.
- Do not modify the plan file itself.

## Phase 3: Validate

- Read `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, or equivalent contributor instructions for the mandated pre-PR command (e.g. `node --run verify`). That wins over everything.
- If the repo relies on pre-commit/pre-push hooks and mandates no manual command, don't invent one — let the hooks run during the `commit-push-pr` handoff.
- If the plan names specific checks, run them when practical. Ask before running anything that's clearly a slow CI-only suite.

Fix any failures before handing off. Do not hand off with known failing checks unless the user explicitly accepts a pre-existing or unrelated failure.

## Phase 4: Hand Off

Invoke the `commit-push-pr` skill. Do not commit, push, or open the PR yourself.

If `commit-push-pr` reports `nothing to ship.`, surface that.

## Phase 5: Final Output

Ensure the user sees the branch name and full PR URL.
