---
name: cb-ship
description: Ship changes. Simplify the diff, commit, review, push, and open or update a PR. Use when the user says 'ship it', 'commit and push', or wants a PR created or updated.
argument-hint: "[--draft] [--spec-context <path-or-reference-or-text>]"
---

## Setup

- If `gh auth status` fails, stop and tell the user.
- Treat `--spec-context` as source-of-truth input for review, never as a PR selector. Preserve and forward its value unchanged; `cb-review` owns resolution.
- If `git fetch` or `git push` fails with public key or agent errors, retry the same operation with `git -c credential.helper='!gh auth git-credential'` while preserving the original remote and branch mapping. For `git fetch`, keep the configured remote (e.g., `git -c credential.helper='!gh auth git-credential' fetch origin <same arguments>`) so `origin/*` refs update; for `git push`, use the same destination and branch mapping, substituting `https://github.com/<org>/<repo>.git` only when the configured remote URL is SSH.
- If `git rev-parse --verify origin/HEAD` fails, `origin/HEAD` is unset. Stop and tell the user to run `git remote set-head origin -a`.
- If `git status --short`, `git log --oneline origin/HEAD..HEAD`, and `gh pr view --json url --jq .url 2>/dev/null` are all empty, stop and reply "nothing to ship."

Resolve bundled "./references" paths relative to SKILL.md.

## Workflow

1. Create a new branch if on the default branch (e.g., `feat/add-user-validation`, `fix/null-check-in-parser`).
2. Use ./references/simplify.md on the full PR diff: `git diff $(git merge-base HEAD origin/HEAD)..HEAD` and any uncommitted changes.
3. Inspect `git status --short`, identify intended files, ask if ambiguous, then git add them. If uncommitted changes, create a conventional commit with `git commit --no-gpg-sign`.
4. Invoke the `cb-review` skill with `--effort low --report`, forwarding `--spec-context` unchanged when supplied so the Spec lens runs against the actual request. Triage each returned finding yourself: if it's real and in scope, apply it, rerun the repo's relevant checks, and commit; otherwise dismiss it with a one-line reason for the output. Skip this step when the session already ran cb-review over these same changes and the same source of truth.
5. Push changes to origin.
6. Create or update the PR using ./references/pr-template.md:
   a. If the host exposes a session ID (e.g., CODEX_THREAD_ID, CLAUDE_CODE_SESSION_ID), include the resume command in the PR body in backticks: ``Agent session: `codex resume <id>` `` or ``Agent session: `claude --resume <id>` ``. Preserve existing `Agent session:` lines, append only.
   b. If a PR exists, update the title and body if the new changes aren't reflected.
   c. Otherwise, create one with `gh pr create`; make it a draft if the user passed `--draft`.
7. Output:

   ```plaintext
   - Directory: [Absolute path]
   - Branch: [Branch name]
   - Review: [N findings — M applied, K dismissed with a one-line reason each] (omit if step 4 skipped or found nothing)
   - Session: [Resume command from 6a] (omit if none)
   - PR: [Complete url] (e.g., `https://github.com/clipboardhealth/core-utils/pull/123`)
   ```
