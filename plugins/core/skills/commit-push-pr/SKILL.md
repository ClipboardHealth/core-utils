---
allowed-tools: Bash(git checkout --branch:*), Bash(git add:*), Bash(git status:*), Bash(git push:*), Bash(git commit:*), Bash(gh pr view:*), Bash(gh pr create:*), Bash(git diff:*), Bash(git merge-base:*)
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

If `Commits ahead of default branch` is `(unknown)`, the ahead-probe failed (e.g., `origin/HEAD` not set) — proceed with the full flow rather than risk skipping real commits. Otherwise, if `Git status`, `Commits ahead of default branch`, and `Existing PR` are all empty/none, stop and reply `nothing to ship.`. Otherwise:

1. Create a new branch if on main (e.g., `feat/add-user-validation`, `fix/null-check-in-parser`).
2. Run the `simplify` skill on the full PR diff — `git diff $(git merge-base HEAD origin/HEAD)..HEAD` plus any uncommitted changes. Wait for it to finish, then include any resulting fixes in the commit.
3. If `git status --short` shows changes, create a single conventional commit.
4. Push the branch to origin.
5. Check for an existing PR with `gh pr view`.
   - No PR: create with `gh pr create`. Title = commit subject. Description = brief explanation of **why**, not what. Append `<!-- commit-push-pr:created v1 -->` on its own line at the end so skill-created PRs can be identified later.
   - PR exists: report the URL and move on.
6. End with one short text response: branch name and the full PR URL (e.g., `https://github.com/clipboardhealth/core-utils/pull/123`). Never use shorthand like `repo#123` — always output the complete URL.
