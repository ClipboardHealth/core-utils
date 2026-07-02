---
name: cb-work
description: Implement a plan file or direct request end-to-end, validate, and ship via cb-ship. Use when the user says 'implement the plan' or clearly wants a change implemented and shipped.
argument-hint: "[--draft] [plan path or implementation request]"
---

## Setup

- **Path-like input** (absolute or relative): Resolve the path. If it doesn't resolve to a readable file, stop and tell the user. Do not reinterpret a missing path as a direct request.
- **Natural-language request**: Treat as the implementation task.
- **No argument**: Ask for either a plan path or the implementation request.

## Prepare

Unless instructed otherwise:

- Create and `cd` into a git worktree based on a freshly fetched `origin/HEAD` using the host's worktree mechanism if it has one; use a descriptive branch name (e.g., `feat/add-user-validation`, `fix/null-check-in-parser`).
- Install dependencies according to repo docs and detected lock files, e.g., `npm ci`.

## Implement

The plan or request is the source of truth for scope:

- Make exactly the changes requested, no extra refactors or cleanup.
- On any drift from the plan (e.g. referenced files or utilities missing, an assumption invalid, a constraint missed) stop and report. Do not silently rewrite the approach.
- Do not modify the plan file itself unless asked.

Run the relevant checks after each meaningful unit of work, not only at the end.

## Validate

If the plan names specific checks, use those; skip clearly slow or CI-only suites. Otherwise find validation commands in, e.g., `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, or pre-commit/pre-push hooks.

Done when every check passes or the user has explicitly accepted a failure.

## Hand off

Invoke the `cb-ship` skill, passing `--draft` if it was passed to this skill. Relay `cb-ship`'s reply to the user.
