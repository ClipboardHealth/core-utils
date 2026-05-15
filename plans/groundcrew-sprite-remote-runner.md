# Groundcrew Sprite Remote Runner Implementation Plan

## Context

PR #651 added `crew sprite setup` and `crew sprite bootstrap`, selective Claude/Codex/GitHub/MCP auth setup, build-secret forwarding for dependency install only, and Sprite-compatible Node/npm bootstrap behavior.

The end-to-end POC against `crew-claude-1` proved:

- `crew sprite bootstrap crew-claude-1 core-utils --branch rocky-sprite-poc-20260514` can clone/fetch, install dependencies, and clean up `/tmp/groundcrew-build-secrets.env`.
- Fresh Sprite commands after bootstrap did not inherit `NPM_TOKEN` or `BUF_TOKEN`.
- GitHub auth in the Sprite can open PRs (`gh auth status` had `repo` scope).
- Claude Code worked remotely and returned `claude-remote-poc-ok`.
- Codex worked remotely after copying local `~/.codex/auth.json` into the Sprite and returned `codex-remote-poc-ok`.
- `sprite exec --tty` only stayed visible in `sprite sessions list` when launched from a real local PTY; this matches using cmux/tmux as the local control plane.

Important design update from the POC: do not assume per-ticket Sprite instances from checkpoints yet. The public `sprite restore` CLI restores into the same Sprite and kills active sessions. For v1, use one shared Sprite (`crew-claude-1`) and create one remote git worktree per ticket inside it.

## Goal

Add a first-class Sprite execution path to groundcrew so a Linear ticket with `agent-remote` plus an existing model label, for example `agent-claude`, is dispatched by groundcrew into a remote Sprite while keeping the existing Linear polling, capacity gating, cmux/tmux workspace UX, branch naming, prompt rendering, cleanup, and PR-opening behavior.

Codex remote is required for v1. `crew sprite attach` / `crew sprite sessions` wrappers are optional and should be included only if they stay tiny; otherwise document raw Sprite commands and leave wrappers for a follow-up.

## Non-Goals

- Do not implement per-ticket Sprite creation from checkpoint until Sprites exposes and we verify a non-destructive create-from-checkpoint API.
- Do not make all agents remote by default.
- Do not auth every MCP server. Keep setup explicit and opt-in.
- Do not pass `NPM_TOKEN`, `BUF_TOKEN`, or other build-only package tokens to the final agent process.
- Do not add babysit-pr orchestration in this PR; agents may still open PRs and humans/groundcrew can babysit separately.

## Critical Files

- `packages/groundcrew/src/lib/boardSource.ts`
- `packages/groundcrew/src/lib/config.ts`
- `packages/groundcrew/src/lib/worktrees.ts`
- `packages/groundcrew/src/lib/launchCommand.ts`
- `packages/groundcrew/src/commands/setupWorkspace.ts`
- `packages/groundcrew/src/commands/dispatcher.ts`
- `packages/groundcrew/src/commands/spriteSetup.ts`
- `packages/groundcrew/README.md`

## Approach

### 1. Add a Runner Concept

Add a runner discriminator separate from model and isolation:

```ts
export type WorkspaceRunner = "local" | "sprite";
```

`local` preserves current behavior. `sprite` means the agent process runs through `sprite exec --tty` inside a remote worktree. Do not overload `models.isolation`; Sprite is a runner, not a safehouse/docker isolation strategy.

Extend the issue model:

- `Issue.runner: WorkspaceRunner | undefined`
- `GroundcrewIssue` narrows `runner` to `WorkspaceRunner`
- Default runner is `local` when a ticket opts into groundcrew but does not have `agent-remote`.

### 2. Parse `agent-remote` as a Modifier Label

Current `parseModel()` uses the first `agent-*` label, so `agent-remote` would accidentally become a model fallback. Replace it with a parser that returns both model and runner.

Rules:

- `agent-claude` + `agent-remote` -> model `claude`, runner `sprite`
- `agent-codex` + `agent-remote` -> model `codex`, runner `sprite`
- `agent-any` + `agent-remote` -> model `any`, runner `sprite`; existing `agent-any` capacity resolution still chooses the concrete model later
- `agent-remote` alone -> model `config.models.default`, runner `sprite`
- no `agent-*` labels -> model/repository/runner all `undefined`, so groundcrew ignores the ticket
- unknown non-reserved `agent-*` label still falls back to `config.models.default`, preserving existing behavior

Apply this to both auto-dispatch and `crew run --ticket`. Manual `crew run --ticket` must return/pass `runner`; otherwise the documented smoke test would launch locally.

### 3. Add Sprite Runner Config

Add config shape with defaults:

```ts
interface SpriteRunnerConfig {
  spriteName: string; // default "crew-claude-1"
  owner: string; // default "ClipboardHealth"
  repoRoot: string; // default "/home/sprite/dev"
  worktreeRoot: string; // default "/home/sprite/groundcrew/worktrees"
  secretNames: string[]; // default BUILD_SECRET_NAMES
}

interface Config {
  remote?: {
    sprite?: Partial<SpriteRunnerConfig>;
  };
}

interface ResolvedConfig {
  remote: {
    sprite: SpriteRunnerConfig;
  };
}
```

Validation:

- `spriteName`, `owner`, `repoRoot`, and `worktreeRoot` must be non-empty strings.
- `secretNames` must be valid environment variable names.
- Use absolute remote paths by default. Do not depend on shell expansion inside `sprite exec --dir`.

Document config in `packages/groundcrew/README.md`.

### 4. Make Branch Naming Shared and Host-Based

Current branch names come from the host OS username via `worktrees.ts`. A remote Sprite shell user is `sprite`, so remote worktree creation must not compute branch names inside the Sprite.

Export a small helper from `worktrees.ts`:

```ts
export function branchNameForTicket(ticket: string): string;
```

Use that helper for host, sandbox, and Sprite worktrees so remote branches remain `rocky-team-123`, not `sprite-team-123`.

### 5. Add Sprite Worktree Adapter

Extend `WorktreeKind`:

```ts
export type WorktreeKind = "host" | "sandbox" | "sprite";
```

Extend `WorktreeEntry` with Sprite metadata when `kind === "sprite"`:

```ts
spriteName?: string;
remoteRepoDir?: string;
```

Route worktree creation by runner, not isolation. One acceptable shape is:

```ts
export interface WorktreeSpec {
  repository: string;
  ticket: string;
  model: string;
  strategy: ResolvedIsolationStrategy;
  runner?: WorkspaceRunner; // default "local"
}
```

The Sprite adapter should do git lifecycle only:

- shared clone: `${config.remote.sprite.repoRoot}/${repoName}`
- worktree: `${config.remote.sprite.worktreeRoot}/${repoName}-${ticket}`
- branch: `branchNameForTicket(ticket)`

Remote create command behavior:

1. `mkdir -p "$repo_root" "$worktree_root"`
2. clone `ClipboardHealth/<repo>` into the shared repo dir if missing
3. `git -C "$repo_dir" fetch origin --prune`
4. fail clearly if the target remote worktree already exists
5. if `origin/<branch>` exists, create/check out a local branch from it in the worktree
6. otherwise create the branch from `origin/<baseBranch>`

Do not run dependency setup in the worktree adapter. Setup belongs in the workspace launch command so the cmux/tmux pane shows install output and build-secret cleanup happens immediately before `exec`ing the agent.

### 6. Track Remote Worktrees Locally

`worktrees.list()` is synchronous and used by dispatcher recovery and cleanup. Do not make the whole dispatcher async just to list remote Sprite state.

Add a small local state file under the existing XDG state location:

```text
${XDG_STATE_HOME:-~/.local/state}/groundcrew/sprite-worktrees.json
```

Store one entry per remote worktree after remote create succeeds:

```json
{
  "entries": [
    {
      "repository": "core-utils",
      "ticket": "team-123",
      "branchName": "rocky-team-123",
      "dir": "/home/sprite/groundcrew/worktrees/core-utils-team-123",
      "kind": "sprite",
      "spriteName": "crew-claude-1",
      "remoteRepoDir": "/home/sprite/dev/core-utils"
    }
  ]
}
```

`worktrees.list()` should include these entries. `findByTicket()` and cleaner/cleanup should then work without changing their public call sites.

On Sprite worktree removal, delete the state entry after remote removal succeeds. If remote removal fails, keep the state entry so a later cleanup can retry.

### 7. Implement Sprite Worktree Removal

For `kind === "sprite"`, `worktrees.remove()` should run a remote shell command like:

```bash
git -C "$remote_repo_dir" worktree remove [--force] "$remote_worktree_dir"
git -C "$remote_repo_dir" branch -D "$branch"
git -C "$remote_repo_dir" worktree prune
```

Run it through:

```bash
sprite exec -s <spriteName> -- bash -lc <quoted-command>
```

If the remote agent is still running and Git refuses to remove the worktree, surface the error. Do not silently kill Sprite sessions in v1. The operator can run raw Sprite commands:

```bash
sprite sessions list -s crew-claude-1
sprite sessions kill -s crew-claude-1 <session-id>
```

### 8. Build a Sprite Launch Command

Extend `SetupWorkspaceOptions`:

```ts
runner?: WorkspaceRunner; // default "local"
```

Local runner path:

- Keep the current implementation unchanged.
- Continue using safehouse/docker/none isolation resolution.

Sprite runner path:

- Skip `resolveIsolationStrategy()` and `ensureClearance()`.
- Create a Sprite worktree via the new worktree adapter.
- Fetch/render the Linear prompt exactly as local setup does.
- Write a local prompt file in a temp dir.
- Write a local build-secrets file from `config.remote.sprite.secretNames`.
- Open a cmux/tmux workspace with:
  - `name: ticket`
  - `cwd: repoDirFor(config, repository)` or `config.workspace.projectDir` (a local cwd that exists)
  - status text like `${model}:remote` or `remote ${model}`
  - command that runs `sprite exec --tty`

The host workspace command should:

1. trap cleanup for the local prompt/secrets temp dir
2. upload the prompt file into the Sprite with `sprite exec --file <localPrompt>:<remotePrompt>`
3. upload the build-secrets file only when it exists
4. run in the remote worktree using an absolute `--dir`, or `cd` inside the remote shell if needed
5. source build secrets with `set -a` before setup
6. run `DEFAULT_SANDBOX_SETUP_COMMAND` from the remote worktree
7. unset forwarded secret names
8. read the remote prompt into `_p`
9. remove remote prompt and secrets files
10. `exec <model cmd> "$_p"`

Substitute `{{worktree}}` in model commands with the remote worktree path. Substitute `{{sandbox}}` with an empty string for Sprite runner unless there is a clear need to expose the Sprite name.

### 9. Pass Runner Through Dispatch

Update dispatcher/start flow so `issue.runner` is passed into `setupWorkspace()`.

Keep capacity behavior model-based for now. `agent-any` still resolves to a model based on usage. `agent-remote` does not add a separate capacity dimension in v1.

Update logs and events to include runner where useful:

- dry-run: `Would start TEAM-123 in core-utils (claude, sprite)`
- start event fields: `model`, `repository`, `runner`
- workspace status: distinguish remote from local

### 10. Make Codex Auth Operational

The POC showed `codex login` left the Sprite reporting `Not logged in`, while copying local `~/.codex/auth.json` made `codex login status` succeed.

Update `crew sprite setup --codex`:

- first run `codex login status`; return if already logged in
- run the existing interactive login flow
- run `codex login status` again
- if still not logged in, fail with actionable guidance

Add explicit opt-in auth-copy support:

```bash
crew sprite setup crew-claude-1 --codex --copy-local-codex-auth
```

Behavior:

- upload `${CODEX_HOME:-$HOME/.codex}/auth.json` to `/home/sprite/.codex/auth.json`
- `chmod 600` the remote file
- run `codex login status`
- never print the auth file contents

Document that Codex auth is agent-available by design, unlike build-only package tokens.

### 11. Docs and Optional Operator Wrappers

Add docs for:

- labeling a ticket with `agent-claude` + `agent-remote`
- running `crew run --ticket <TICKET>` manually
- remote cleanup fallback with `sprite sessions list/kill`
- how to re-auth Codex if `codex login status` fails in the Sprite

Optional wrappers:

```bash
crew sprite sessions [<sprite-name>]
crew sprite attach <session-id-or-command> [--sprite <sprite-name>]
```

Include these wrappers only if they stay thin. Otherwise, document raw Sprite commands and leave wrappers for a follow-up.

## Verification

Unit tests:

- `boardSource.test.ts`
  - `agent-remote` alone defaults model and selects Sprite runner
  - `agent-claude` + `agent-remote` selects model `claude`, runner `sprite`
  - `agent-any` + `agent-remote` preserves model `any`, runner `sprite`
  - manual `fetchResolvedIssue()` preserves runner for `crew run --ticket`
  - unknown model label behavior remains compatible
- `config.test.ts`
  - `remote.sprite` defaults
  - validation rejects empty sprite names/paths and invalid secret names
- `worktrees.test.ts`
  - Sprite create command builds shared clone path and per-ticket worktree path
  - Sprite create uses host-computed branch name
  - Sprite remove command removes worktree, deletes branch, prunes, and removes local state only after success
  - `worktrees.list()` includes local Sprite state entries
- `launchCommand.test.ts` or `setupWorkspace.test.ts`
  - Sprite runner skips safehouse/docker isolation
  - Sprite runner opens cmux/tmux with local cwd and `sprite exec --tty`
  - Sprite launch uploads prompt and build secrets, runs setup, clears secrets, and does not expose `NPM_TOKEN`/`BUF_TOKEN` to the final agent command
  - rollback removes Sprite worktree and local prompt dir when workspace open fails
- `dispatcher.test.ts`
  - start passes runner to `setupWorkspace`
  - dry-run/log/event output includes runner
- `spriteSetup.test.ts`
  - `--copy-local-codex-auth` uploads auth file, runs `chmod 600`, and validates status
  - failed Codex login status produces actionable error

Validation commands:

```bash
npm exec nx run groundcrew:test:ci
npm exec nx build groundcrew
node --run verify
```

Manual smoke test:

1. Confirm baseline Sprite:

   ```bash
   sprite list --prefix crew-claude
   sprite exec -s crew-claude-1 -- gh auth status
   sprite exec -s crew-claude-1 -- claude --version
   sprite exec -s crew-claude-1 -- codex login status
   ```

2. Create or reuse a Linear test ticket that mentions `core-utils` and has labels `agent-claude` and `agent-remote`.
3. Run:

   ```bash
   op run --env-file "${XDG_CONFIG_HOME:-$HOME/.config}/groundcrew/op.env" -- crew run --ticket <TICKET>
   ```

4. Verify a cmux/tmux workspace opens and the command is `sprite exec --tty`.
5. Verify in Sprite:

   ```bash
   sprite sessions list -s crew-claude-1
   sprite exec -s crew-claude-1 -- bash -lc 'git -C "$HOME/dev/core-utils" worktree list'
   ```

6. Verify the agent shell has no package tokens:

   ```bash
   sprite exec -s crew-claude-1 --dir /home/sprite/groundcrew/worktrees/core-utils-<ticket> -- bash -lc 'printf "NPM_TOKEN=%s\nBUF_TOKEN=%s\n" "${NPM_TOKEN:+present}" "${BUF_TOKEN:+present}"'
   ```

7. Move the ticket to a terminal Linear status or run `crew cleanup <TICKET>` and verify the remote worktree/state entry is removed.

## Acceptance Criteria

- A ticket labeled `agent-remote` launches remotely in `crew-claude-1` through groundcrew.
- `crew run --ticket <TICKET>` also honors `agent-remote`.
- Multiple tickets in the same repository can run concurrently because each has a separate remote worktree.
- The final agent process can use Claude/Codex/GitHub auth but cannot see build-only package tokens.
- Existing local/safehouse/docker behavior is unchanged for tickets without `agent-remote`.
- `crew cleanup <TICKET>` handles Sprite worktree entries recorded by groundcrew.
- CI and review checks pass.
