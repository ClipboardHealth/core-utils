# Git Workflow

- Follow Conventional Commits 1.0 spec for commit messages and PR titles.
- **Do NOT use scopes** in commit messages or PR titles. Scopes (the parenthesized part in `feat(scope): ...`) interfere with Nx release detection in monorepos — Nx uses file-based heuristics to determine which project a commit affects, and an unrecognized scope causes it to skip the release entirely. Put ticket IDs in the description instead.
  - `feat: add orientation shift type to open shifts response [TFR-239]`
  - Not: `feat(TFR-239): add orientation shift type to open shifts response`
- `main` is the default branch.

## Pull Requests

1. Clear title: change summary + ticket
2. Thorough description: why, not just what
3. Small & focused: single concept
4. Tested: service tests + validation proof
5. Passing CI

Link Linear ticket in PR description. Include context, reasoning, and areas of concern.

Include proof of validation: tests, screenshots, telemetry, or Loom video.

Split large non-functional changes (refactors, dependency upgrades) into separate PRs from feature work.
