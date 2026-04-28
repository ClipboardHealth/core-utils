---
description: Implement a plan file end-to-end, then hand off to commit-push-pr to ship it. Use when the user says 'go', 'execute the plan', 'implement the plan', or hands off a plan file for execution.
---

# Go: Execute a Plan and Ship It

Given a plan file, implement everything the plan describes, then invoke the `commit-push-pr` skill to commit, push, and open a PR.

This skill is the bridge between planning and shipping. It does not re-plan or re-design — the plan is the source of truth. If the plan is wrong, surface that; do not silently improvise.

## Phase 1: Locate and Read the Plan

The user invokes this skill with a plan file path or identifier as an argument. Resolve it in this order:

1. **Absolute path** (starts with `/`): read it directly.
2. **Relative path** (contains `/` or starts with `./`): resolve from the current working directory.
3. **Bare name** (no path separators, e.g. `my-plan` or `my-plan.md`): look in the host's plans directory. Use whatever directory the current host stores plan files in — do not hard-code a host-specific path. If the host does not expose a plans directory, ask the user where the plan lives.
4. **No argument given**: ask the user to provide the plan file path. Do not guess.

If the plan file does not exist or cannot be read, stop and tell the user. Do not proceed without a plan.

Read the entire plan before starting. Note the **Critical files**, **Approach**, and **Verification** sections (or their equivalents).

## Phase 2: Implement the Plan

Treat the plan as the source of truth for scope:

- Make exactly the changes the plan describes — no more, no less. Do not add extra refactors, tests, or cleanup the plan did not ask for.
- If the plan references files, functions, or utilities that no longer exist, stop and surface the discrepancy before guessing.
- If you discover the plan is wrong (the codebase has moved, an assumption is invalid, a constraint was missed), stop and report. Do not silently rewrite the approach.
- Do **not** modify the plan file itself.

## Phase 3: Validate

Validation is **mandatory** and runs on every invocation, even when the plan does not include a Verification section. A missing or incomplete Verification section is not permission to skip validation — it is a gap to close.

Run validation in this order:

1. **Repo-mandated pre-PR checks.** Look up the repo's standard pre-PR command. Common signals, in priority order:
   - An explicit instruction in the repo's agent or contributor instructions, such as `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, or an equivalent host-specific instruction file (e.g. "MUST run before opening PRs"). This wins over everything else.
   - A conventionally-named script in `package.json` / Python project config / `Makefile` / etc. — `affected`, `precommit`, `validate`, `check`, `verify`, `test`, `lint`, `typecheck`, or repo-equivalent.
   - If nothing else, run the project's lint + typecheck + test commands directly.

   If you cannot determine the right command, ask the user before proceeding — do not silently skip.

2. **Plan-specific verification.** If the plan has a Verification section, run those checks too. They are additive to (not a replacement for) the repo-mandated checks.

If any check fails, fix the failures and re-run. Do not hand off to `commit-push-pr` with failing checks. If a failure looks pre-existing (unrelated to your changes), confirm that with the user before proceeding — do not assume.

## Phase 4: Hand Off to commit-push-pr

Once implementation is complete and Phase 3 validation passes, invoke the `commit-push-pr` skill by name using this agent's normal skill invocation mechanism — not a hard-coded host-specific command. That skill handles branching (if needed), running `simplify` on the changed files, committing, pushing, and opening the PR.

Do **not** commit, push, or open the PR yourself in this skill. Let `commit-push-pr` own that flow so the shipping logic stays in one place.

If `commit-push-pr` reports `nothing to ship.` (the plan resulted in no actual file changes), surface that to the user — it usually means the plan was already implemented or the plan was a no-op.

## Phase 5: Final Output

After `commit-push-pr` returns, send one short final response with the branch name and the full PR URL it produced. If `commit-push-pr` reported nothing to ship, say so plainly.
