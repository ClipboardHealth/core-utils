---
name: local-development
description: Run `cbh dev up` to start the Clipboard service stack locally so you can verify code changes against your own working tree. Supports git worktrees via per-invocation `--service-dir` overrides and non-interactive agent runs via `--services`. Auto-detects `cmux` and falls back to `tmux` or plain scripts. Use when the user wants to "run services locally", "spin up the local stack", "boot backend-main locally", "start payment-service locally", or otherwise needs locally-running services pointed at edited code (including a non-default worktree path). Once services are up, hand off to `clipboard-testing` for verification and test-data generation against the local stack.
---

# Local Development

Launch the Clipboard service stack locally via `cbh dev up`. This skill stops once services are reachable on localhost; verification, token minting, and test-data generation are `clipboard-testing`'s job (it works against the local stack you just started OR the `development` AWS cluster).

## When to use this skill vs others

| If the goal is…                                                                        | Use…                |
| -------------------------------------------------------------------------------------- | ------------------- |
| Driving APIs to verify a change OR generate test data (local OR `development` cluster) | `clipboard-testing` |
| Generating test data via GitHub Actions in a deployed env (no local stack)             | `seed-data`         |
| Linking local copies of `@clipboard-health/*` packages into another repo               | `local-package`     |

If the user wants to "test my change end-to-end against my edits", chain this skill (start the stack) → `clipboard-testing` (drive APIs at `http://localhost:5000`).

## Prerequisites

`cbh dev up` checks these before launching anything; if they're missing, it fails with a specific error.

| Tool                                             | Required when                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------- |
| `git`, `gh auth status`, `nvm` (with `$NVM_DIR`) | Always                                                                          |
| Docker (running)                                 | A picked service has `requiresDocker: true` (`backend-main`, `payment-service`) |
| AWS VPN connected                                | A picked service has `requiresVpn: true` (`backend-main`, `payment-service`)    |

AWS credentials are refreshed automatically via `aws sso login --profile sdlc` when a VPN-required service is picked (skip with `--skip-setup`).

## First-time setup

Run `cbh dev config` once to point the CLI at where your repos live:

```bash
cbh dev config
```

It writes `~/.cbh/dev.yml` and auto-detects each service under your base directory (default `~/repos/cbh`). If that file doesn't exist, `cbh dev up` will offer to run the wizard for you (interactive mode only — in non-interactive mode it falls back to defaults silently).

## Running the stack

```bash
# Interactive: pick which services to start from a checkbox prompt
cbh dev up

# Skip npm install, docker startup, env generation, AWS SSO refresh
# (only when services were already set up)
cbh dev up --skip-setup
```

## Non-interactive (agent) usage

When you're driving this from an agent or script, use `--services` to skip the picker prompt entirely. The wizard prompt is also suppressed in this mode — defaults are used silently if `~/.cbh/dev.yml` is missing.

```bash
# Start one service non-interactively
cbh dev up --services backend-main

# Multiple services in one run
cbh dev up --services backend-main payment-service

# Equivalent repeatable form
cbh dev up -s backend-main -s payment-service
```

Rules:

- Unknown or duplicate `--services` values fail fast with a clear error.
- For unattended runs on VPN-required services, pair with `--skip-setup` (or pre-run `aws sso login --profile sdlc`) so the SSO browser prompt is skipped.
- `--services` composes with `--service-dir` for worktree targeting.

## What launcher gets used

`cbh dev up` auto-detects what's available and picks the best fit:

| Condition                                        | Result                                                                                               |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Inside an existing tmux session (`$TMUX` is set) | Services launch in tiled panes of the current window                                                 |
| Outside tmux, `cmux` installed                   | Each service is opened as its own `cmux` workspace (`cmux new-workspace`). Open the cmux app to view |
| Outside tmux, no `cmux`, `tmux` installed        | A new tmux session named `cbh-dev` is created; attach with `tmux attach -t cbh-dev`                  |
| Neither `tmux` nor `cmux` installed              | One bash script per service is written under `/tmp/cbh-dev-*/`; run each in its own terminal         |

## Pointing `dev up` at a worktree

When the user is working in a git worktree of a service repo (common in agent workflows), use `--service-dir` to override the path for THAT invocation only — `~/.cbh/dev.yml` is not modified.

```bash
# Single worktree
cbh dev up --services backend-main \
  --service-dir backend-main=/tmp/wt/clipboard-health

# Multiple worktrees in one run
cbh dev up --services backend-main payment-service \
  --service-dir backend-main=/tmp/wt/clipboard-health \
  --service-dir payment-service=/tmp/wt/payment-service
```

Rules:

- The path must be absolute (or `~/...` — both are resolved). Relative paths are rejected.
- The path must exist and be a directory; `dev up` validates before launching.
- Service keys must match the registry. Valid keys: `backend-main`, `payment-service`, `admin-frontend`, `mobile-app`.
- Flag overrides win over `~/.cbh/dev.yml` overrides for the same key.
- Per-invocation only — `~/.cbh/dev.yml` is never written by this flag.

## Picking services for the change

| Change touches…                    | Start these services                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| `clipboard-health/` (backend-main) | `backend-main` (+ `admin-frontend` if testing UI flows)                       |
| `payment-service/`                 | `payment-service` + `backend-main` (most payment flows route through backend) |
| `cbh-admin-frontend/`              | `admin-frontend` + `backend-main`                                             |
| `cbh-mobile-app/`                  | `mobile-app` + `backend-main`                                                 |

Default ports: `backend-main` → `5000`, `payment-service` → `5001`, frontends use their own dev-server ports.

## Verifying it's running

```bash
curl -fsS http://localhost:5000/api/health   # backend-main
curl -fsS http://localhost:5001/api/health   # payment-service (if started)
```

If those return 200, hand off to `clipboard-testing` for the actual verification or test-data work.

## Handoff to verification / test data

Once services are reachable, switch to `clipboard-testing`. It supports both the local stack you just started AND the `development` AWS cluster — pick the target based on what's being tested:

- Local code changes that aren't deployed yet → `localhost`.
- Integration with deployed services or anything you can't run locally → `development`.

This skill (`local-development`) does **not** mint tokens, hit endpoints, or seed data — that's `clipboard-testing`'s job.

## Troubleshooting

| Symptom                                               | Fix                                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `tmux session 'cbh-dev' already exists`               | `tmux kill-session -t cbh-dev`, then re-run                                                 |
| Duplicate-named cmux workspaces accumulating          | Close prior workspaces in the cmux app before re-running (cmux launcher doesn't auto-clean) |
| `Service directory not found` (no `--service-dir`)    | Run `cbh dev config` to set the base dir / per-service paths                                |
| `Service directory not found` (with `--service-dir`)  | Path doesn't exist or isn't a directory; double-check the absolute path                     |
| `Unknown service key in --service-dir` / `--services` | Valid keys: `backend-main`, `payment-service`, `admin-frontend`, `mobile-app`               |
| `Invalid --service-dir value`                         | Format is `<service-key>=<path>` with a single `=` separator                                |
| AWS VPN-related failures                              | Connect VPN, then run `aws sso login --profile sdlc` and retry                              |

## Hard rules

- Never run service start commands directly (e.g. `cd clipboard-health && npm run start:dev`). Always go through `cbh dev up` so prerequisites are checked.
- Never edit `~/.cbh/dev.yml` by hand for a one-off worktree run — use `--service-dir`.
- Never use `--skip-setup` on a fresh checkout; it skips `npm install`, env generation, and AWS SSO refresh.
- In non-interactive contexts (agents, scripts, CI), always pass `--services` — `cbh dev up` will otherwise block on the checkbox prompt forever.

## Known limitations (parallel agents)

- The tmux session name is hardcoded to `cbh-dev` (`packages/cli/src/lib/dev/launcher.ts`).
- Services bind to fixed local ports (`5000`, `5001`).
- Two agents running `cbh dev up` against different worktrees in parallel will collide on both. Run one stack at a time for now.
- The cmux launcher does not auto-clean prior `cbh dev` workspaces the way the tmux launcher does (`tmux kill-session -t cbh-dev`). Re-running with the same `--services` set will accumulate duplicate-named cmux workspaces.
