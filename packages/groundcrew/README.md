# @clipboard-health/groundcrew

Watch a Linear project and farm out ready tickets to coding-agent CLIs running in workspaces backed by git worktrees. Workspaces are [`cmux`](https://github.com/clayton-cole/cmux) panes on macOS or `tmux` windows on Linux/macOS.

## Install

```bash
npm install -g @clipboard-health/groundcrew
```

This installs the `crew` binary. `@clipboard-health/clearance` is pulled in transitively and provides the `clearance` / `clearance-ensure` bins used by Safehouse isolation.

## Quickstart

1. **Install prereqs.** Node 24, `git`, `cmux` _or_ `tmux`, and the runtimes you actually want: Docker Sandboxes (`sbx`) for sandbox-backed agents, [Safehouse](https://github.com/anthropics/safehouse) for macOS sandboxing, and the agent CLIs themselves (`claude`, `codex`, `cursor-agent`, ...). Optional: `codexbar` for session-usage gating. The `workspaceKind` config key picks the workspace backend (`auto` resolves to cmux when installed, else tmux).

2. **Create a Linear project to scope your work.** Any team works — make a project inside it and drop tickets in. The orchestrator polls by project, not by team, so you don't need a dedicated team.

3. **Create your config.** Copy the shipped example into your working directory and edit it:

   ```bash
   cp "$(npm root -g)/@clipboard-health/groundcrew/configExample.ts" ./config.ts
   $EDITOR ./config.ts
   ```

   At minimum set `linear.projectSlug` (paste the trailing segment of your Linear project URL, e.g. `ai-strategy-5152195762f3`), `workspace.projectDir`, and `workspace.knownRepositories`. Everything else has a default.

   `crew` loads `./config.ts` from the current directory by default. Override the location with `GROUNDCREW_CONFIG=/path/to/config.ts`.

4. **Provide a Linear API key.** `crew` expects `LINEAR_API_KEY` in its environment. Any mechanism works — shell export, [direnv](https://direnv.net/), a `.env` file you `source`, or piping through `op run` if you store the credential in 1Password:

   ```bash
   # Direct
   export LINEAR_API_KEY="lin_api_..."
   crew doctor

   # Via 1Password CLI (`op`), if you keep the key in a vault
   echo "LINEAR_API_KEY='op://<vault>/LINEAR_API_KEY/credential'" > .env.1password
   op run --env-file .env.1password -- crew doctor
   ```

5. **Prepare isolation and agent auth.** With `models.isolation: "auto"`, groundcrew prefers Safehouse on supported hosts. If Safehouse is unavailable and the model has a `sandbox` config, it uses persistent Docker Sandboxes. Set `models.isolation: "none"` only when you intentionally want direct, non-isolated execution.

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

6. **Run.** Doctor first, then a dry run, then the real thing:

   ```bash
   crew doctor
   crew run --dry-run
   crew run            # one-shot
   crew run --watch    # poll forever
   ```

   When groundcrew resolves a model to the `safehouse` isolation strategy, it calls `ensureClearance` from `@clipboard-health/clearance` to start `clearance` on `http://127.0.0.1:19999` if nothing is already listening, then launches the agent through the bundled `safehouse-clearance` wrapper. The default allowlist covers model APIs, Linear, Notion, Slack, and Datadog. Override it before starting groundcrew:

   ```bash
   CLEARANCE_ALLOW_HOSTS="api.openai.com,auth.openai.com,api.anthropic.com,mcp.linear.app,api.linear.app" \
   crew run --watch
   ```

   Or point at one or more allow-host files (groundcrew ships a starter file at `$(npm root -g)/@clipboard-health/groundcrew/clearance-allow-hosts`):

   ```bash
   CLEARANCE_ALLOW_HOSTS_FILES="$(npm root -g)/@clipboard-health/groundcrew/clearance-allow-hosts:$HOME/.config/clearance/personal-allow-hosts" \
   crew run --watch
   ```

   Proxy output is written to `${XDG_CACHE_HOME:-$HOME/.cache}/clearance/clearance.log`, and the PID is written beside it as `clearance.pid`. Watch the proxy's `DENY` log lines and add only the domains your agents actually need.

## Config reference

Required fields are marked **required**; everything else has a default and can be omitted from `config.ts`.

| Key                                     | Default             | What it does                                                                                                                                                                                                                                                         |
| --------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `linear.projectSlug`                    | **required**        | Linear project URL slug (e.g. `ai-strategy-5152195762f3`). The trailing 12-char hex `slugId` is what's matched against Linear's API; the leading name keeps `config.ts` self-documenting and the lookup survives project renames.                                    |
| `linear.statuses.todo`                  | `"Todo"`            | Status name picked up for new work.                                                                                                                                                                                                                                  |
| `linear.statuses.inProgress`            | `"In Progress"`     | Status set after a workspace is provisioned; counts toward `maximumInProgress`.                                                                                                                                                                                      |
| `linear.statuses.done`                  | `"Done"`            | Status that triggers worktree cleanup.                                                                                                                                                                                                                               |
| `linear.statuses.terminal`              | `["Done"]`          | Additional status names treated as terminal for cleanup, board remaining counts, and blocker checks. The `done` status is always included.                                                                                                                           |
| `git.remote`                            | `"origin"`          | Remote used for `fetch` and as the worktree base ref.                                                                                                                                                                                                                |
| `git.defaultBranch`                     | `"main"`            | Branch fetched from `git.remote` and used as the worktree base.                                                                                                                                                                                                      |
| `workspace.projectDir`                  | **required**        | Parent dir for cloned repos. `$PROJECT_DIR` env var overrides. Sandbox-backed ticket worktrees live under each repo's `.sbx/` directory.                                                                                                                             |
| `workspace.knownRepositories`           | **required**        | Repos searched for in ticket descriptions to infer where work belongs. Tickets fail fast when no known repo appears.                                                                                                                                                 |
| `orchestrator.maximumInProgress`        | `4`                 | Cap on tickets in `linear.statuses.inProgress` at once.                                                                                                                                                                                                              |
| `orchestrator.pollIntervalMilliseconds` | `120_000`           | Poll interval in `--watch` mode.                                                                                                                                                                                                                                     |
| `orchestrator.sessionLimitPercentage`   | `85`                | Number in `(0, 100]`. A model whose codexbar session window exceeds this percentage is skipped that tick.                                                                                                                                                            |
| `models.default`                        | `"claude"`          | Agent used when a ticket has no agent label. Must exist in `models.definitions`.                                                                                                                                                                                     |
| `models.isolation`                      | `"auto"`            | Isolation strategy. `"auto"` picks Safehouse on a supported host, else Docker Sandboxes when the model has a sandbox config. Safehouse support or a model sandbox config is required; if neither is available, setup fails. Set `"none"` explicitly to run directly. |
| `models.definitions`                    | `{ claude, codex }` | Agent definitions. Additive merge with shipped defaults.                                                                                                                                                                                                             |
| `models.definitions.<name>.cmd`         | —                   | Shell command launched for the model. For sandbox-backed models this runs inside the persistent sandbox; otherwise it runs in the workspace. `{{worktree}}` and `{{sandbox}}` are replaced before launch.                                                            |
| `models.definitions.<name>.color`       | —                   | Color for the workspace status pill (cmux only; tmux silently drops it).                                                                                                                                                                                             |
| `models.definitions.<name>.sandbox`     | `{ agent }`         | Optional Docker Sandboxes backing. Defaults set `claude` → `agent: "claude"` and `codex` → `agent: "codex"`. Set `sandbox: false` on an override to run the command outside Docker Sandboxes.                                                                        |
| `models.definitions.<name>.usage`       | optional            | If set, codexbar usage is fetched for this model and gated by `sessionLimitPercentage`. Omit to never gate. When `usage.codexbar.source` is omitted, groundcrew uses `auto` on macOS and `cli` elsewhere.                                                            |
| `prompts.initial`                       | (template)          | First message sent to the agent. Placeholders: `{{ticket}}`, `{{worktree}}`, `{{title}}`, `{{description}}`.                                                                                                                                                         |
| `workspaceKind`                         | `"auto"`            | Terminal session manager. `"auto"` picks `cmux` when on PATH, else `tmux`. Set to `"cmux"` or `"tmux"` to fail loudly when the chosen backend is missing. tmux windows live in a dedicated `groundcrew` session.                                                     |

The branch prefix (`<prefix>-<TICKET>`) is derived from your OS username (`os.userInfo().username`), not configured. Agent selection looks for a top-level Linear label named `agent-<model>` (e.g. `agent-claude`, `agent-codex`). The reserved label `agent-any` routes the ticket to the configured model with the most available session capacity (lowest codexbar session-used percent), skipping any model already over `sessionLimitPercentage`. With no usage data, `agent-any` resolves to `models.default`. The name `any` cannot be used in `models.definitions`. Todo tickets blocked by Linear issues that are not in `linear.statuses.terminal` are skipped until their blockers reach a terminal status.

## Manual commands

```bash
crew sandbox auth <repo> --model claude
crew sandbox auth <repo> --model codex
crew run --ticket <TICKET>
crew cleanup <TICKET>
```

`crew run --ticket <TICKET>` provisions a single ticket the same way the orchestrator would: the repo is parsed from the ticket's Linear description and the model comes from the ticket's `agent-*` label. If the description does not mention a repo from `workspace.knownRepositories`, setup fails before provisioning. `--watch` and `--ticket` are mutually exclusive — `--watch` drives the orchestrator loop; `--ticket` provisions one ticket and exits. `crew cleanup <TICKET>` resolves to every worktree carrying that ticket id (host and sandbox kinds, across repos) and tears them all down. To inspect codexbar session windows directly, run `codexbar usage`; the orchestrator already gates on this internally via `orchestrator.sessionLimitPercentage`.

## Gotchas

- **Auto isolation prefers Safehouse.** The shipped `models.isolation: "auto"` uses Safehouse on supported hosts. When Safehouse is unavailable, shipped models with Docker Sandbox config use a persistent sandbox per repo/model, named `groundcrew-<repo>-<model>`. `crew run --ticket` creates per-ticket `sbx --branch` worktrees inside that sandbox and launches the task with `sbx exec`, so `npm clean-install` and the agent both run inside Docker.
- **Safehouse uses clearance.** On hosts where `auto` resolves to Safehouse, groundcrew starts `clearance` when needed via `@clipboard-health/clearance`, then runs the `safehouse-clearance` wrapper shipped in that package, which loads the bundled `clearance.env` and appends `clearance-only.sb`. If a model command already starts with `safehouse`, groundcrew assumes that command owns its Safehouse flags and does not add the proxy profile a second time. To inspect blocked requests, run `tail -f "${XDG_CACHE_HOME:-$HOME/.cache}/clearance/clearance.log"`. To change the allowlist, set `CLEARANCE_ALLOW_HOSTS` (or `CLEARANCE_ALLOW_HOSTS_FILES`); if the proxy is already running, stop the PID in `clearance.pid` so the next launch can restart it with the new env.
- **Authenticate before first ticket setup.** Run `crew sandbox auth <repo> --model <name>` before `crew run` for a repo/model. That first run carries no ticket prompt, so a required OAuth `/login` cannot consume task context.
- **Sandbox cleanup is intentionally conservative.** `crew cleanup` removes the per-ticket worktree and branch, but keeps the persistent sandbox so OAuth sessions, installed packages, and agent config survive later tickets. Use `sbx ls` and `sbx rm --force <name>` when you intentionally want to delete that persisted sandbox state.
- **Usage source defaults are OS-aware.** `codexbar` usage uses `--source auto` on macOS so CodexBar can prefer account/web sources and fall back as it supports. On Linux/WSL it uses `--source cli`, so install the CodexBar Linux CLI and authenticate the provider CLIs inside that environment.
- **Status names matter.** If your team uses `Started` instead of `In Progress`, set `linear.statuses.inProgress = "Started"`.
- **Leaf-only.** Parent issues with children are ignored — sub-issues are the work items.
- **Tickets stay in the in-progress status until externally promoted.** A PR open is the typical signal; whatever your Linear "in review" automation is, the orchestrator does not do that move itself.
- **Project must be on a single Linear team in practice.** Cross-team projects work — the orchestrator caches the in-progress state ID per team — but every team in the project must use the same status name for `linear.statuses.inProgress`.
- **Doctor's command introspection is shallow.** For sandbox-backed models it checks `sbx` plus `sbx diagnose`. For non-sandbox models it tokenizes `cmd` and checks the first two non-flag tokens against PATH (so `safehouse claude --foo` checks both `safehouse` and `claude`). Boolean flags without values, env-var assignments (`FOO=1`), shell pipelines, and subshells are not parsed — verify those manually. In particular, `npx -y claude` and `env FOO=1 claude` only check the wrapper, not the wrapped CLI.
- **Agent CLI must accept a positional prompt.** The handoff is `<your cmd> "<prompt>"`. `claude`, `codex`, and `cursor-agent` all support this.
