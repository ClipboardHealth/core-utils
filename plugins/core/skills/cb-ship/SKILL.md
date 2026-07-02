---
name: cb-ship
description: Ship changes. Simplify the diff, commit, push, and open or update a PR. Use when the user says 'ship it', 'commit and push', or wants a PR created or updated.
argument-hint: "[--draft]"
---

## Setup

- If `gh auth status` fails, stop and tell the user.
- If `git rev-parse --verify origin/HEAD` fails, `origin/HEAD` is unset. Stop and tell the user to run `git remote set-head origin -a`.
- If `git status --short`, `git log --oneline origin/HEAD..HEAD`, and `gh pr view --json url --jq .url 2>/dev/null` are all empty, stop and reply "nothing to ship."

Resolve bundled "./references" paths relative to SKILL.md.

## Workflow

1. Create a new branch if on the default branch (e.g., `feat/add-user-validation`, `fix/null-check-in-parser`).
2. Use ./references/simplify.md on the full PR diff: `git diff $(git merge-base HEAD origin/HEAD)..HEAD` and any uncommitted changes.
3. Inspect `git status --short`, identify intended files, ask if ambiguous, then git add them. If uncommitted changes, create a conventional commit with `git commit --no-gpg-sign`.
4. Push changes to origin.
5. Create or update the PR using ./references/pr-template.md:
   a. If the host exposes a session ID (e.g., CODEX_THREAD_ID, CLAUDE_CODE_SESSION_ID), include the resume command in the PR body in backticks: ``Agent session: `codex resume <id>` `` or ``Agent session: `claude --resume <id>` ``. Preserve existing `Agent session:` lines, append only.
   b. If a PR exists, update the title and body if the new changes aren't reflected.
   c. Otherwise, create one with `gh pr create`; make it a draft if the user passed `--draft`.
6. Output:

   ```plaintext
   - Directory: [Absolute path]
   - Branch: [Branch name]
   - Session: [Resume command from 5a] (omit if none)
   - PR: [Complete url] (e.g., `https://github.com/clipboardhealth/core-utils/pull/123`)
   ```
