---
allowed-tools: Bash(git checkout --branch:*), Bash(git add:*), Bash(git status:*), Bash(git push:*), Bash(git commit:*), Bash(gh pr view:*), Bash(gh pr create:*), Bash(gh pr edit:*), Bash(git diff:*), Bash(git merge-base:*), Bash(bash scripts/find-session-id.sh:*)
description: Commit, push, and open a PR. Use when the user wants to ship changes, create a pull request, or says things like 'commit and push', 'open a PR', 'ship it', 'send it', 'create a PR for this', or 'push this up'.
---

## Context

- Current branch: !`git branch --show-current`
- Git status: !`git status --short`
- Commits ahead of default branch: !`git log --oneline origin/HEAD..HEAD 2>/dev/null || echo "(unknown)"`
- Existing PR: !`gh pr view --json url --jq .url 2>/dev/null || echo "none"`
- Diff summary: !`git diff HEAD --stat`
- Full diff: !`git diff HEAD`

## Your task

If `Commits ahead of default branch` is `(unknown)`, `origin/HEAD` couldn't be resolved — stop and tell the user to run `git remote set-head origin -a` (or otherwise set the default branch) before retrying, since the simplify step also depends on it. Otherwise, if `Git status`, `Commits ahead of default branch`, and `Existing PR` are all empty/none, stop and reply `nothing to ship.`. Otherwise:

1. Create a new branch if on main (e.g., `feat/add-user-validation`, `fix/null-check-in-parser`).
2. Run the `simplify` skill on the full PR diff — `git diff $(git merge-base HEAD origin/HEAD)..HEAD` plus any uncommitted changes. When it returns, continue to step 3 in the same turn; do not stop.
3. If `git status --short` shows changes, create a single conventional commit.
4. Push the branch to origin.
5. Look up the current agent session ID with `bash scripts/find-session-id.sh '<phrase>'`. Pass a distinctive verbatim chunk (≥10 words) from the most recent user message; see the script header for quoting constraints. On success the script prints `<agent> <id>`; otherwise nothing — if empty, omit the session ID line below.
6. Check for an existing PR with `gh pr view`.
   - No PR: create with `gh pr create`. Title = commit subject. Description = brief explanation of **why**, not what. Append two lines on their own at the end:
     - `Agent session ID: <output of step 5>` (e.g. `Agent session ID: claude-code c8fb7000-...`) — omit entirely if step 5 produced no output.
     - `<!-- commit-push-pr:created v1 -->` so skill-created PRs can be identified later.
   - PR exists: refresh the body via `gh pr edit --body` whenever either of the following is stale, preserving everything else (including the `<!-- commit-push-pr:created v1 -->` sentinel). Then report the URL.
     - **Description prose**: if the new commit's changes aren't already covered, incorporate them.
     - **`Agent session ID:` line(s)**: if step 5's output isn't already a line in the body, append it on its own line above the `<!-- commit-push-pr:created v1 -->` sentinel. Never remove or rewrite existing `Agent session ID:` lines — every agent session that contributed to the PR keeps its own line so the history is preserved. If step 5 produced no output, do nothing here.
7. End with one short text response: branch name and the full PR URL (e.g., `https://github.com/clipboardhealth/core-utils/pull/123`). Never use shorthand like `repo#123` — always output the complete URL.
