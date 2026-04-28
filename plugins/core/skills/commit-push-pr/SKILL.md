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

**First, decide from the context above. If `Commits ahead of default branch` is `(unknown)`, skip this decision and use the full flow below.**

- If `Git status` is empty AND `Commits ahead of default branch` is empty AND `Existing PR` is `none`: stop. Reply with `nothing to ship.` and do nothing else.
- If `Git status` is empty but there are `Commits ahead of default branch` or an `Existing PR`: still run step 1 and step 2. Then re-check `git status --short`; skip step 3 only if it remains empty. Then continue with step 4 and step 5.
- Otherwise: proceed with all steps below.

Based on the above changes:

1. Create a new branch if on main (e.g., `feat/add-user-validation`, `fix/null-check-in-parser`)
2. Run the `simplify` skill on the files included in the PR before committing, pushing, or opening the PR. If the working tree is clean, run `simplify` against `git diff $(git merge-base HEAD origin/HEAD)..HEAD`. If the working tree has changes, run it against `git diff HEAD`; when local commits also exist, include `git diff $(git merge-base HEAD origin/HEAD)..HEAD` as additional PR context. Invoke the skill by name using this agent's normal skill invocation mechanism. Wait for the skill to finish, then include any resulting fixes in the commit step below.
3. Re-check `git status --short`. If there are changes, create a single conventional commit message.
4. Push the branch to origin
5. Check for an existing PR with `gh pr view`.
   - No PR exists: Create with `gh pr create`. Title = commit subject line. Description = brief explanation of **why**, not what. Append `<!-- commit-push-pr:created v1 -->` on its own line at the end of the PR description so skill-created PRs can be identified later.
   - PR exists: Report the URL and move on.
6. You have the capability to call multiple tools in a single response. After the `simplify` skill completes, do the remaining git and PR operations in a single message. Do not use any other tools or do anything else.
7. After tool calls complete, send one short final text response with the branch name and the full PR URL (e.g., `https://github.com/clipboardhealth/core-utils/pull/123`). Never use shorthand like `repo#123` — always output the complete URL so it is clickable.
