---
description: Implement a plan file or direct request end-to-end, then hand off to commit-push-pr to ship it. Use when the user says 'go', 'execute the plan', 'implement the plan', or gives an implementation request.
---

# Go: Execute Work and Ship It

Given a plan file or direct implementation request, implement the requested work, then invoke the `commit-push-pr` skill to commit, push, and open a PR.

This skill is the bridge between intent and shipping. It does not re-plan or re-design unless the user asked for that. If the request is wrong or cannot be implemented safely, surface that; do not silently improvise.

## Phase 1: Understand the Input

The user may invoke this skill with either a plan file path/identifier or a direct implementation request such as "add a button to the homepage to log in." Resolve the input in this order:

1. **Absolute path** (starts with `/`): read it directly only when it is inside the current workspace/repo root or the host's plans directory. If it is outside those roots, ask the user to confirm before reading it; if they do not confirm, stop and ask for an approved path.
2. **Relative path** (contains `/` or starts with `./`): resolve from the current working directory.
3. **Bare name** (no path separators, e.g. `my-plan` or `my-plan.md`): if the host exposes a plans directory, look there first. Use whatever directory the current host stores plan files in — do not hard-code a host-specific path. If no plan is found and the input is ambiguous, ask whether it is a plan identifier or an implementation request.
4. **Natural-language request** (for example, contains spaces or reads like an implementation task): treat it as the implementation request. There may be no separate plan file.
5. **No argument given**: ask the user to provide either the plan file path or the implementation request. Do not guess.

If a path-like input does not exist or cannot be read, stop and tell the user. Do not reinterpret a missing path as a direct request.

When using a plan, read the entire plan before starting. Note the **Critical files**, **Approach**, and **Verification** sections (or their equivalents).

## Phase 2: Implement the Request

Treat the plan or direct request as the source of truth for scope:

- Make exactly the changes requested — no more, no less. Do not add extra refactors, tests, or cleanup the request did not ask for.
- If a plan references files, functions, or utilities that no longer exist, stop and surface the discrepancy before guessing.
- If you discover the request is wrong (the codebase has moved, an assumption is invalid, a constraint was missed), stop and report. Do not silently rewrite the approach.
- For direct implementation requests, inspect the relevant code before editing and use the repo's existing patterns.
- Do **not** modify the plan file itself when working from a plan.

## Phase 3: Validate

Validation should follow the repo's instructions and the cost profile of the repo. Some repos intentionally leave slow checks to CI; do not run broad or slow suites unless the repo instructions explicitly require them.

Run validation in this order:

1. **Repo instructions.** Look up the repo's standard validation guidance. Common signals, in priority order:
   - An explicit instruction in the repo's agent or contributor instructions, such as `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, or an equivalent host-specific instruction file (e.g. "MUST run before opening PRs"). This wins over everything else.
   - A relevant `package.json` script when the repo instructions point to it, such as `affected`, `precommit`, `validate`, `check`, `verify`, `test`, `lint`, `typecheck`, or repo-equivalent.
   - A repo-specific equivalent in the rare case the project does not use `package.json`.

   If the repo primarily relies on git pre-commit or pre-push hooks and does not mandate a manual validation command, do not invent one. Let the hooks run during the `commit-push-pr` handoff.

2. **Request-specific verification.** If the plan or user request names specific checks, run them when they are practical and consistent with the repo instructions. If a requested check is clearly a slow CI-only suite, ask before running it.

If any check you run fails, fix the failures and re-run the same check. Do not hand off to `commit-push-pr` with known failing checks unless the user explicitly accepts a pre-existing or unrelated failure.

## Phase 4: Hand Off to commit-push-pr

Once implementation is complete and Phase 3 validation is satisfied, invoke the `commit-push-pr` skill by name using this agent's normal skill invocation mechanism.

Do **not** commit, push, or open the PR yourself in this skill. Let `commit-push-pr` own the shipping flow.

If `commit-push-pr` reports `nothing to ship.` (the work resulted in no actual file changes), surface that to the user — it usually means the request was already implemented or was a no-op.

## Phase 5: Final Output

After `commit-push-pr` returns, ensure the user sees one short final response with the branch name and the full PR URL it produced. If the current host already surfaced that response, do not duplicate it. If `commit-push-pr` reported nothing to ship, say so plainly.
