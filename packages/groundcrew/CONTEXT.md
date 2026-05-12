# groundcrew domain language

Six nouns that are collision-prone in this codebase. Use them precisely; don't substitute one for another in code, comments, or PR descriptions.

## Worktree

The directory an agent works in for a single ticket. Two kinds, one concept:

- **Host worktree** — a `git worktree add`'d sibling at `<projectDir>/<repo>-<TICKET>/`. Visible to the host's `git worktree list --porcelain`.
- **Sandbox worktree** — an `sbx run --branch` worktree at `<repoDir>/.sbx/<sandboxName>-worktrees/<branchName>/`. Created and removed inside the persistent sandbox container; **not** visible to the host's git worktree list. Removal goes through `sbx exec <sandbox> git ... worktree remove`.

Lifecycle and lookup live in `src/lib/worktrees.ts`. Callers ask `worktrees.create(spec)` / `worktrees.findByTicket(...)` / `worktrees.remove(entry)` / `worktrees.teardown(entries)` and never branch on the kind themselves — the module dispatches.

Branch name is `<os-username>-<ticket-lowercased>` (slash-free, since sbx materializes branches as directories). One ticket can have at most one worktree per kind, but both kinds can coexist mid-strategy-switch; `list()` returns both.

`teardown(entries)` is the destructive lifecycle for a Worktree paired with its Workspace. It closes the live Workspace (deduped per ticket so host+sandbox kinds share one close) before removing each Worktree, and survives per-entry failures, returning a structured result. The order is non-negotiable: the Workspace must close while its underlying directory and branch still exist, or the user is left with a zombie Workspace. Cleaner's per-iteration sweep, the `crew cleanup` CLI, and `setupWorkspace`'s rollback path all route through this one operation.

## Workspace

The host-side terminal session that runs an agent for one ticket. Two kinds, one concept:

- **cmux workspace** — a pane/tab in [cmux](https://github.com/clayton-cole/cmux). macOS-only.
- **tmux workspace** — a window inside a dedicated `groundcrew` tmux session. Linux/macOS.

Every provisioned ticket gets one workspace, named with the ticket id (`TEAM-220`). Tracked by ticket, not by worktree kind — there is one workspace per ticket regardless of host vs sandbox.

Lifecycle and lookup live in `src/lib/workspaces.ts`. Callers ask `workspaces.open(spec)` / `workspaces.probe()` / `workspaces.close(name)` and never branch on the kind themselves — the module dispatches via the resolved adapter (`workspaceKind` config + host capabilities). `probe()` returns a typed `WorkspaceProbe` (`{ kind: "ok"; names }` or `{ kind: "unavailable"; error? }`) so callers don't re-invent a sentinel when the adapter binary is flaky.

`groundcrew` opens workspaces in `setupWorkspace`, closes them in `cleaner.runOnce`. Distinct from `worktrees`; do not call a workspace a "worktree."

## Sandbox

A persistent Docker Sandboxes container created with `sbx run` and named `groundcrew-<repo>-<model>` (e.g. `groundcrew-core-utils-claude`). One per repo+model. Survives across tickets so OAuth, installed packages, and agent config persist. Distinct from a sandbox **worktree** — the sandbox is the container; the worktree is a directory inside it.

Lifecycle: created once via `crew sandbox auth <repo> --model <model>`, reused forever after. `crew cleanup` never removes it; only the user explicitly removes it via `sbx rm`.

## Dispatcher

The per-iteration decider that picks Todo tickets to start and acts on the picks. One per `orchestrate()` invocation; reuses its team-state cache across iterations within an invocation, but resets between CLI runs.

Lifecycle lives in `src/commands/dispatcher.ts`. Callers ask `dispatcher.runOnce({state, worktreeEntries, dryRun})` and never reach into the classifier internals — the module dispatches.

Dispatch decisions are recorded under `logEvent("dispatch", ...)`. Distinct from cleanup, which uses `logEvent("cleanup", ...)`.

## Cleaner

The per-iteration scanner that closes workspaces and removes worktrees for tickets that have reached a terminal status. One per `orchestrate()` invocation; stateless across iterations. Mirrors `Dispatcher`.

Lifecycle lives in `src/commands/cleaner.ts`. Callers ask `cleaner.runOnce({state, worktreeEntries, dryRun})` and never reach into the cleanup internals — the module closes the workspace and removes the worktree for each terminal ticket, in that order, and survives per-entry failures.

Cleanup decisions are recorded under `logEvent("cleanup", ...)`. Distinct from dispatch, which uses `logEvent("dispatch", ...)`.

## BoardSource

The Linear adapter that turns the project's GraphQL state into a `BoardState` snapshot. One per `orchestrate()` invocation; stateless across calls.

Lifecycle lives in `src/lib/boardSource.ts`. Callers ask `boardSource.verify()` once at startup (fail-fast on a missing project) and `boardSource.fetch()` per tick; nothing else in the package reaches Linear's GraphQL API. The module owns label-based model parsing (`agent-*` labels) and description-based repository parsing — callers consume a typed `Issue[]`.
