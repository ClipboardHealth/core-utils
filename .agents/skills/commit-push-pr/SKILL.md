---
allowed-tools: Bash(git checkout --branch:*), Bash(git add:*), Bash(git status:*), Bash(git push:*), Bash(git commit:*), Bash(gh pr view:*), Bash(gh pr create:*), Bash(git diff:*)
description: Commit, push, and open a PR. Use when the user wants to ship changes, create a pull request, or says things like 'commit and push', 'open a PR', 'ship it', 'send it', 'create a PR for this', or 'push this up'.
---

## Context

- Current branch: !`git branch --show-current`
- Git status: !`git status --short`
- Diff summary: !`git diff HEAD --stat`
- Full diff: !`git diff HEAD`

## Your task

**First, check the `Git status` context above:**

- If it's empty AND the branch has no commits ahead of main (nothing to push, no existing PR): stop. Reply with `nothing to ship.` and do nothing else.
- If it's empty but the branch has unpushed commits or an existing PR: skip steps 1 and 2 below. Go straight to step 3 (push if needed) and step 4 (PR reconciliation).
- Otherwise: proceed with all steps below.

Based on the above changes:

1. Create a new branch if on main (e.g., `feat/add-user-validation`, `fix/null-check-in-parser`)
2. Create a single conventional commit message
3. Push the branch to origin
4. Check for an existing PR with `gh pr view`.
   - No PR exists: Create with `gh pr create`. Title = commit subject line. Description = brief explanation of **why**, not what.
   - PR exists: Report the URL and move on.
5. You have the capability to call multiple tools in a single response. You MUST do all of the above in a single message. Do not use any other tools or do anything else.
6. After tool calls complete, send one short final text response with the branch name and the full PR URL (e.g., `https://github.com/clipboardhealth/core-utils/pull/123`). Never use shorthand like `repo#123` — always output the complete URL so it is clickable.
