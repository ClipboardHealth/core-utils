---
description: "Writing commit messages, PR titles and descriptions, or reviewing pull requests"
---

# Git Workflow

- Follow Conventional Commits 1.0 spec for commit messages and PR titles.
- `main` is the default branch.

## Pull Requests

1. Clear title: change summary + ticket
2. Thorough description: why, not just what
3. Small & focused: single concept
4. Tested: service tests + validation proof
5. Passing CI

Link Linear ticket in PR description. Include context, reasoning, and areas of concern.

Include proof of validation: tests, screenshots, telemetry, or Loom video.

When you make a judgment call a human should confirm (a cache duration, a default value, a copy
choice), list it under `## Reviewer decisions` in the PR description instead of stopping to ask.

Split large non-functional changes (refactors, dependency upgrades) into separate PRs from feature work.
