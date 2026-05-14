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

Before doing any step, output the full 7-step checklist below in your first response so it stays in recent context across sub-skill calls. Do not skip this — it's what keeps you from stopping after `simplify`.

Use this PR body shape when creating or refreshing descriptions:

```md
## Summary

Brief "why" and the meaningful behavior/system change.

## Validation

- List proof of validation: commands, screenshots, telemetry, Loom, or `Not run: <reason>`.

## Notes

Optional: ticket links, rollout plan, residual risk, or areas for reviewers to focus on.

Agent session: <copyable resume command>

<!-- commit-push-pr:created v1 core@3.4.0 -->
```

- Omit `## Notes` when there are no useful notes beyond the metadata footer.
- Do not invent ticket links, validation evidence, rollout plans, or risks. Use `Not run: <reason>` when validation was not run.
- Keep agent session lines and `<!-- commit-push-pr:created ... -->` sentinels as footer metadata, separate from the prose. Preserve existing session and sentinel lines exactly, including older `Agent session ID: ...` lines.

1. Create a new branch if on main (e.g., `feat/add-user-validation`, `fix/null-check-in-parser`).
2. Run the `simplify` skill on the full PR diff — `git diff $(git merge-base HEAD origin/HEAD)..HEAD` plus any uncommitted changes. When it returns, your very next action is to restate the remaining steps (3–7) and continue with step 3 in the same turn. Do not stop, do not end the turn with a simplify summary.
3. If `git status --short` shows changes, create a single conventional commit with `git commit --no-gpg-sign`.
4. Push the branch to origin.
5. Look up the current agent session ID with `bash scripts/find-session-id.sh '<phrase>'`. Pass a distinctive verbatim chunk (≥10 words) from the most recent user message; see the script header for quoting constraints. On success the script prints `<agent> <id>`; otherwise nothing. Convert known outputs to a copyable resume command for the PR footer: `codex <id>` -> `Agent session: codex resume <id>`; `claude-code <id>` -> `Agent session: claude --resume <id>`. If empty, omit the session line below.
6. Check for an existing PR with `gh pr view`.
   - No PR: create with `gh pr create`. Title = commit subject. Description = the PR body shape above. Append the converted agent session line from step 5 (omit if step 5 produced no output) and `<!-- commit-push-pr:created v1 core@3.4.0 -->` on their own lines at the end.
   - PR exists: refresh the body via `gh pr edit --body` so (a) the new commit's changes are reflected in the prose while existing `## Summary`, `## Validation`, and `## Notes` sections are preserved unless clearly stale, (b) the converted agent session line from step 5 appears in the footer — append if missing, never remove or rewrite existing session lines so each contributing session is preserved — and (c) any existing `<!-- commit-push-pr:created v1 ... -->` line is preserved verbatim (append `<!-- commit-push-pr:created v1 core@3.4.0 -->` if absent). Then report the URL.
7. End with one short text response: branch name and the full PR URL (e.g., `https://github.com/clipboardhealth/core-utils/pull/123`). Never use shorthand like `repo#123` — always output the complete URL.
