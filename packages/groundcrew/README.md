# @clipboard-health/groundcrew

Watch a Linear project and farm out ready tickets to coding-agent CLIs running in workspaces backed by git worktrees. Workspaces are [`cmux`](https://github.com/clayton-cole/cmux) panes on macOS or `tmux` windows on Linux/macOS.

## Install

```bash
npm install -g @clipboard-health/groundcrew
```

This installs the `crew` binary. `@clipboard-health/clearance` is pulled in transitively and provides the `clearance` / `clearance-ensure` bins used by Safehouse isolation.

## Quickstart

1. **Install prereqs.** Node 24, `git`, `cmux` _or_ `tmux`, and the runtimes you actually want: Docker Sandboxes (`sbx`) for sandbox-backed agents, [Safehouse](https://agent-safehouse.dev/) for macOS sandboxing, and the agent CLIs themselves (`claude`, `codex`, `cursor-agent`, ...). Optional: `codexbar` for session-usage gating. The `workspaceKind` config key picks the workspace backend (`auto` resolves to cmux when installed, else tmux).

2. **Create a Linear project to scope your work.** Any team works — make a project inside it and drop tickets in. The orchestrator polls by project, not by team, so you don't need a dedicated team.

3. **Create your config.** Copy the shipped example into the XDG config path and edit it:

   ```bash
   mkdir -p "${XDG_CONFIG_HOME:-$HOME/.config}/groundcrew"
   cp "$(npm root -g)/@clipboard-health/groundcrew/configExample.ts" \
      "${XDG_CONFIG_HOME:-$HOME/.config}/groundcrew/config.ts"
   $EDITOR "${XDG_CONFIG_HOME:-$HOME/.config}/groundcrew/config.ts"
   ```

   At minimum set `linear.projectSlug` (paste the trailing segment of your Linear project URL, e.g. `ai-strategy-5152195762f3`), `workspace.projectDir`, and `workspace.knownRepositories`. Everything else has a default.

   `crew` resolves the config path as: `GROUNDCREW_CONFIG` if set → `${XDG_CONFIG_HOME:-$HOME/.config}/groundcrew/config.ts` if it exists → a `config.ts` sitting next to `crew`'s own source files (only useful from a local checkout; see [Hacking on groundcrew](#hacking-on-groundcrew)). Set `GROUNDCREW_CONFIG` only when you want to override the XDG location.

4. **Provide a Linear API key.** `crew` expects `LINEAR_API_KEY` in its environment. Any mechanism works — shell export, [direnv](https://direnv.net/), a `.env` file you `source`, or piping through `op run` if you store the credential in 1Password:

   ```bash
   # Direct
   export LINEAR_API_KEY="lin_api_..."
   crew doctor

   # Via 1Password CLI (`op`), if you keep the key in a vault
   echo "LINEAR_API_KEY='op://<vault>/LINEAR_API_KEY/credential'" > .env.1password
   op run --env-file .env.1password -- crew doctor
   ```

5. **Prepare isolation and agent auth.** With `models.isolation: "auto"`, groundcrew prefers Safehouse on macOS. On non-macOS hosts, it falls back to persistent Docker Sandboxes if the model has a `sandbox` config. Set `models.isolation: "none"` only when you intentionally want direct, non-isolated execution.

   If you use Docker Sandboxes, start the daemon and log in before `crew run`:

   ```bash
   sbx daemon start
   sbx login
   ```

   Then prepare each repo/model sandbox once. For Claude, this opens the agent with no ticket prompt so you can complete `/login` without losing task context:

   ```bash
   crew sandbox auth <repo> --model claude
   ```

   For Codex, groundcrew starts Docker's host-side OpenAI OAuth flow before preparing the sandbox:

   ```bash
   crew sandbox auth <repo> --model codex
   ```

6. **Set the clearance allowlist (Safehouse only).** When the resolved isolation strategy is Safehouse, groundcrew starts `clearance` from `@clipboard-health/clearance` on `http://127.0.0.1:19999` (skipping the launch if something is already listening) and runs the agent through the bundled `safehouse-clearance` wrapper. Clearance refuses to start without an allowlist — see [its README](../clearance/README.md) for the proxy's env vars, log paths, and DNS rules. The shortest path is to set the env before `crew run`:

   ```bash
   CLEARANCE_ALLOW_HOSTS="api.openai.com,auth.openai.com,api.anthropic.com,mcp.linear.app,api.linear.app" \
   crew run --watch
   ```

   Groundcrew also ships a starter allowlist file covering model APIs, Linear, Notion, Slack, Datadog, GitHub, npm, and common dev tooling at `$(npm root -g)/@clipboard-health/groundcrew/clearance-allow-hosts`. Point clearance at it (and optionally a personal file) via `CLEARANCE_ALLOW_HOSTS_FILES`:

   ```bash
   CLEARANCE_ALLOW_HOSTS_FILES="$(npm root -g)/@clipboard-health/groundcrew/clearance-allow-hosts:$HOME/.config/clearance/personal-allow-hosts" \
   crew run --watch
   ```

   Watch `${XDG_CACHE_HOME:-$HOME/.cache}/clearance/clearance.log` for `DENY` lines and add only the domains your agents actually need.

7. **Run.** Doctor first, then a dry run, then the real thing:

   ```bash
   crew doctor
   crew run --dry-run
   crew run            # one-shot
   crew run --watch    # poll forever
   ```

## Config reference

Required fields are marked **required**; everything else has a default and can be omitted from `config.ts`.

| Key                                     | Default             | What it does                                                                                                                                                                                                                                                    |
| --------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `linear.projectSlug`                    | **required**        | Linear project URL slug (e.g. `ai-strategy-5152195762f3`). The trailing 12-char hex `slugId` is what's matched against Linear's API; the leading name keeps `config.ts` self-documenting and the lookup survives project renames.                               |
| `linear.statuses.todo`                  | `"Todo"`            | Status name picked up for new work.                                                                                                                                                                                                                             |
| `linear.statuses.inProgress`            | `"In Progress"`     | Status set after a workspace is provisioned; counts toward `maximumInProgress`.                                                                                                                                                                                 |
| `linear.statuses.done`                  | `"Done"`            | Status that triggers worktree cleanup.                                                                                                                                                                                                                          |
| `linear.statuses.terminal`              | `["Done"]`          | Additional status names treated as terminal for cleanup, board remaining counts, and blocker checks. The `done` status is always included.                                                                                                                      |
| `git.remote`                            | `"origin"`          | Remote used for `fetch` and as the worktree base ref.                                                                                                                                                                                                           |
| `git.defaultBranch`                     | `"main"`            | Branch fetched from `git.remote` and used as the worktree base.                                                                                                                                                                                                 |
| `workspace.projectDir`                  | **required**        | Parent dir for cloned repos. Sandbox-backed ticket worktrees live under each repo's `.sbx/` directory.                                                                                                                                                          |
| `workspace.knownRepositories`           | **required**        | Repos searched for in ticket descriptions to infer where work belongs. A ticket labeled for groundcrew (`agent-*`) fails fast when no known repo appears; unlabeled tickets are ignored.                                                                        |
| `orchestrator.maximumInProgress`        | `4`                 | Cap on tickets in `linear.statuses.inProgress` at once.                                                                                                                                                                                                         |
| `orchestrator.pollIntervalMilliseconds` | `120_000`           | Poll interval in `--watch` mode.                                                                                                                                                                                                                                |
| `orchestrator.sessionLimitPercentage`   | `85`                | Number in `(0, 100]`. A model whose codexbar session window exceeds this percentage is skipped that tick.                                                                                                                                                       |
| `models.default`                        | `"claude"`          | Tiebreak for `agent-any` resolution and fallback for explicit but unknown `agent-*` labels. Also used by `crew setup <TICKET>` for unlabeled tickets. `crew run` ignores unlabeled tickets and does not apply this default. Must exist in `models.definitions`. |
| `models.isolation`                      | `"auto"`            | Isolation strategy. `"auto"` picks Safehouse on macOS, else Docker Sandboxes when the model has a sandbox config. Safehouse or a model sandbox config is required; if neither is available, setup fails. Set `"none"` explicitly to run directly.               |
| `models.definitions`                    | `{ claude, codex }` | Agent definitions. Additive merge with shipped defaults.                                                                                                                                                                                                        |
| `models.definitions.<name>.cmd`         | —                   | Shell command launched for the model. For sandbox-backed models this runs inside the persistent sandbox; otherwise it runs in the workspace. `{{worktree}}` and `{{sandbox}}` are replaced before launch.                                                       |
| `models.definitions.<name>.color`       | —                   | Color for the workspace status pill (cmux only; tmux silently drops it).                                                                                                                                                                                        |
| `models.definitions.<name>.sandbox`     | `{ agent }`         | Optional Docker Sandboxes backing. Defaults set `claude` → `agent: "claude"` and `codex` → `agent: "codex"`. Set `sandbox: false` on an override to run the command outside Docker Sandboxes.                                                                   |
| `models.definitions.<name>.usage`       | optional            | If set, codexbar usage is fetched for this model and gated by `sessionLimitPercentage`. Omit to never gate. When `usage.codexbar.source` is omitted, groundcrew uses `auto` on macOS and `cli` elsewhere.                                                       |
| `prompts.initial`                       | (template)          | First message sent to the agent. Placeholders: `{{ticket}}`, `{{worktree}}`, `{{title}}`, `{{description}}`.                                                                                                                                                    |
| `workspaceKind`                         | `"auto"`            | Terminal session manager. `"auto"` picks `cmux` when on PATH, else `tmux`. Set to `"cmux"` or `"tmux"` to fail loudly when the chosen backend is missing. tmux windows live in a dedicated `groundcrew` session.                                                |
| `logging.file`                          | XDG state path      | Append-mode log file destination. `log()` / `logEvent()` tee here in addition to stdout, so a vanished workspace doesn't take the evidence with it. Defaults to `${XDG_STATE_HOME:-$HOME/.local/state}/groundcrew/groundcrew.log`.                              |

The branch prefix (`<prefix>-<TICKET>`) is derived from your OS username (`os.userInfo().username`), not configured. Agent selection looks for a top-level Linear label named `agent-<model>` (e.g. `agent-claude`, `agent-codex`). **`crew run` only fetches tickets with an `agent-*` label** — the GraphQL query filters them server-side, so unlabeled tickets are never returned by Linear's API and do not appear in the rendered board. Use `crew setup <TICKET>` to provision an unlabeled ticket on demand (manual setup falls back to `models.default`). The reserved label `agent-any` routes the ticket to the configured model with the most available session capacity (lowest codexbar session-used percent), skipping any model already over `sessionLimitPercentage`. With no usage data, `agent-any` resolves to `models.default`. The name `any` cannot be used in `models.definitions`. Todo tickets blocked by Linear issues that are not in `linear.statuses.terminal` are skipped until their blockers reach a terminal status.

## Manual commands

```bash
crew sandbox auth <repo> --model claude
crew sandbox auth <repo> --model codex
crew run --ticket <TICKET>
crew cleanup <TICKET>
```

`crew run --ticket <TICKET>` provisions a single ticket the same way the orchestrator would: the repo is parsed from the ticket's Linear description and the model comes from the ticket's `agent-*` label. If the description does not mention a repo from `workspace.knownRepositories`, setup fails before provisioning. `--watch` and `--ticket` are mutually exclusive — `--watch` drives the orchestrator loop; `--ticket` provisions one ticket and exits. `crew cleanup <TICKET>` resolves to every worktree carrying that ticket id (host and sandbox kinds, across repos) and tears them all down. To inspect codexbar session windows directly, run `codexbar usage`; the orchestrator already gates on this internally via `orchestrator.sessionLimitPercentage`.

## Gotchas

- **Auto isolation prefers Safehouse.** The shipped `models.isolation: "auto"` uses Safehouse on macOS. On non-macOS hosts (Linux/WSL), shipped models with Docker Sandbox config use a persistent sandbox per repo/model, named `groundcrew-<repo>-<model>`. `crew run --ticket` creates per-ticket `sbx --branch` worktrees inside that sandbox and launches the task with `sbx exec`, so `npm clean-install` and the agent both run inside Docker.
- **Safehouse-already-wrapped commands are not re-wrapped.** If a `models.definitions.<name>.cmd` already starts with `safehouse`, groundcrew assumes that command owns its Safehouse flags and does not add the `safehouse-clearance` wrapper a second time. Changing the proxy's allowlist after it's running requires killing the PID in `${XDG_CACHE_HOME:-$HOME/.cache}/clearance/clearance.pid` so the next launch picks up the new env.
- **Authenticate before first ticket setup.** Run `crew sandbox auth <repo> --model <name>` before `crew run` for a repo/model. That first run carries no ticket prompt, so a required OAuth `/login` cannot consume task context.
- **Sandbox cleanup is intentionally conservative.** `crew cleanup` removes the per-ticket worktree and branch, but keeps the persistent sandbox so OAuth sessions, installed packages, and agent config survive later tickets. Use `sbx ls` and `sbx rm --force <name>` when you intentionally want to delete that persisted sandbox state.
- **Usage source defaults are OS-aware.** `codexbar` usage uses `--source auto` on macOS so CodexBar can prefer account/web sources and fall back as it supports. On Linux/WSL it uses `--source cli`, so install the CodexBar Linux CLI and authenticate the provider CLIs inside that environment.
- **Status names matter.** If your team uses `Started` instead of `In Progress`, set `linear.statuses.inProgress = "Started"`.
- **Leaf-only.** Parent issues with children are ignored — sub-issues are the work items.
- **Tickets stay in the in-progress status until something else moves them.** Groundcrew sets a ticket to `inProgress` when it provisions a workspace and never advances it. The next transition (typically "in review" when a PR opens) is left to your team's Linear automation rules.
- **Project must be on a single Linear team in practice.** Cross-team projects work — the orchestrator caches the in-progress state ID per team — but every team in the project must use the same status name for `linear.statuses.inProgress`.
- **Doctor's command introspection is shallow.** For sandbox-backed models it checks `sbx` plus `sbx diagnose`. For non-sandbox models it tokenizes `cmd` and checks the first two non-flag tokens against PATH (so `safehouse claude --foo` checks both `safehouse` and `claude`). Boolean flags without values, env-var assignments (`FOO=1`), shell pipelines, and subshells are not parsed — verify those manually. In particular, `npx -y claude` and `env FOO=1 claude` only check the wrapper, not the wrapped CLI.
- **Agent CLI must accept a positional prompt.** The handoff is `<your cmd> "<prompt>"`. `claude`, `codex`, and `cursor-agent` all support this.

## Hacking on groundcrew

For developers working on the package itself, the source lives in [`ClipboardHealth/core-utils`](https://github.com/ClipboardHealth/core-utils). Clone it, run `npm install`, and the repo's `crew` / `crew:op` scripts execute groundcrew straight from TypeScript source — no build step. The bin's `runCli` helper re-execs node with `--conditions @clipboard-health/source` so `@clipboard-health/clearance` also resolves to source.

```bash
cd ~/dev/c/core-utils
node --run crew -- doctor

# With 1Password for LINEAR_API_KEY:
node --run crew:op -- run --watch
```

Both forms read `${XDG_CONFIG_HOME:-$HOME/.config}/groundcrew/config.ts` by default; set `GROUNDCREW_CONFIG` to point elsewhere. The `crew:op` wrapper additionally reads `${XDG_CONFIG_HOME:-$HOME/.config}/groundcrew/op.env` (1Password env-file with `op://` references resolved at launch) — symlink it there if you keep yours elsewhere; the path is not configurable.

Logs land in `${XDG_STATE_HOME:-$HOME/.local/state}/groundcrew/groundcrew.log` by default (override via `logging.file` in your config). The "Loaded config from …" line at startup tells you which config won.

Source edits in `packages/{clearance,groundcrew}/src/**` are picked up on the next invocation. Requires Node ≥ 24.3 (the version with native `.ts` type stripping enabled by default).
