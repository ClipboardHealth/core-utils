---
name: commit-push-pr
description: "Commit, push, and open a PR. Use when the user wants to ship changes, create a pull request, or says things like 'commit and push', 'open a PR', 'ship it', 'send it', 'create a PR for this', or 'push this up'."
argument-hint: "[commit-message]"
allowed-tools: Bash(git checkout --branch:*), Bash(git add:*), Bash(git status:*), Bash(git push:*), Bash(git commit:*), Bash(gh pr view:*), Bash(gh pr create:*), Bash(git diff:*)
---

# Commit, Push, and PR

## Context

- Current branch: !`git branch --show-current`
- Git status: !`git status --short`
- Diff summary: !`git diff HEAD --stat`
- Full diff: !`git diff HEAD`
- Recent commits (match this style): !`git log --oneline -5`

## Instructions

Execute all steps in a **single message** using parallel tool calls. No extra commentary.

1. **Branch**: If on `main`, create and check out a branch (e.g., `feat/add-user-validation`, `fix/null-check-in-parser`). Use a short, descriptive name matching the change.

2. **Stage and Commit**: Stage the relevant changed files and create a commit.
   - If `$ARGUMENTS` is provided, use it as the commit message.
   - Otherwise, write a Conventional Commits message: `type(scope): description`
   - Match the style of recent commits shown above.
   - Keep the subject line under 72 characters.
   - Pass the message via a HEREDOC.
   - End with `Co-Authored-By: Claude <noreply@anthropic.com>`

3. **Push**: `git push -u origin HEAD`

4. **PR**: Check for an existing PR with `gh pr view`.
   - **No PR exists**: Create with `gh pr create`. Title = commit subject line. Description = brief explanation of **why**, not what. Use a HEREDOC for the body.
   - **PR exists**: Report the URL and move on.

## Input

Commit message (optional): $ARGUMENTS
