# Git Workflow

Follow Conventional Commits 1.0 spec for commit messages and PR titles.

## Pull Requests

1. Clear title: change summary + ticket
2. Thorough description: why, not just what
3. Small & focused: single concept
4. Tested: service tests + validation proof
5. Passing CI

Link Linear ticket in PR description. Include context, reasoning, and areas of concern.

Include proof of validation: tests, screenshots, telemetry, or Loom video.

Split large non-functional changes (refactors, dependency upgrades) into separate PRs from feature work.
