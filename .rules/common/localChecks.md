---
description: "Running type checks, lint, or tests locally to verify a change"
---

# Local Checks

CI owns full type checking. `tsgo` and type-aware Oxlint use every CPU core and several GiB of
memory, and parallel worktrees multiply that load until the machine stalls.

- Verify locally with scoped checks: the tests for the code you changed, and lint on changed files
  (`lint:fast` when the repo has it).
- Run full type checks only when the user asks.
