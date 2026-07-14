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
- Read the repository instructions that apply to the files you will touch. Read any `CONTEXT.md` or ADRs that cover the affected area before naming tests or interfaces.

## Implement

The plan or request is the source of truth for scope:

- Make exactly the changes requested, no extra refactors or cleanup.
- On any drift from the plan (e.g. referenced files or utilities missing, an assumption invalid, a constraint missed) stop and report. Do not silently rewrite the approach.
- Do not modify the plan file itself unless asked.

Run the relevant checks after each meaningful unit of work, not only at the end.

For behavior changes in repositories with automated tests, use vertical red-green-refactor slices:

1. Derive the public test seam from the source of truth. If the seam is unclear and the choice would materially affect scope or architecture, stop and ask; otherwise state the seam in a progress update and proceed.
2. Write one behavior test through that seam. Avoid private interfaces, internal-collaborator assertions, and expected values computed with the implementation's algorithm.
3. Run the focused test and confirm it fails for the intended reason.
4. Implement only enough to pass, rerun the focused test, then refactor while it stays green. Repeat one slice at a time.

Mock only at system boundaries such as third-party APIs, time, randomness, or external I/O. Prefer real controlled collaborators, including a test database when practical. After each green slice, run the narrowest applicable typecheck; if the repository exposes only a slow workspace-wide typecheck, defer it to final validation. For documentation, metadata, or other changes without runtime behavior, do not invent a test; use the relevant validation instead.

## Validate

If the plan names specific checks, use those. Otherwise find validation commands in, e.g., `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, or pre-commit/pre-push hooks. After the focused implementation checks pass, run the repository's complete required validation once. Skip only additional slow or CI-only suites that the repository does not require.

Done when every check passes or the user has explicitly accepted a failure.

## Hand off

Invoke the `cb-ship` skill, passing `--draft` if it was passed to this skill. Pass `--spec-context` with the source of truth: the plan path, ticket or spec reference, or the natural-language implementation request. Preserve the original context instead of relying on the eventual commit or PR description to reconstruct it. Relay `cb-ship`'s reply to the user.
