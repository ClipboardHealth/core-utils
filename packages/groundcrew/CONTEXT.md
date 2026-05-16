# groundcrew domain language

Six nouns that are collision-prone in this codebase. Use them precisely; don't substitute one for another in code, comments, or PR descriptions.

## Worktree

The directory an agent works in for a single ticket. Two kinds, one concept:

- **Host worktree** — a `git worktree add`'d sibling at `<projectDir>/<repo>-<TICKET>/`. Visible to the host's `git worktree list --porcelain`.
- **Remote worktree** — a remote git worktree under `remote.worktreeRoot` on the configured remote runner. Tracked by groundcrew in `remote-worktrees.json`; not visible to the host's `git worktree list --porcelain`.

Lifecycle and lookup live in `src/lib/worktrees.ts`. Callers ask `worktrees.create(spec)` / `worktrees.findByTicket(...)` / `worktrees.remove(entry)` / `worktrees.teardown(entries)` and never branch on the kind themselves — the module dispatches.

Branch name is `<os-username>-<ticket-lowercased>`. One ticket can have at most one worktree per kind; local host and remote worktrees can coexist when a ticket moves between runners. `list()` returns host and remote worktrees, and intentionally ignores legacy `.sbx` directories.

`teardown(entries)` is the destructive lifecycle for a Worktree paired with its Workspace. It closes the live Workspace (deduped per ticket so host and remote entries share one close) before removing each Worktree, and survives per-entry failures, returning a structured result. The order is non-negotiable: the Workspace must close while its underlying directory and branch still exist, or the user is left with a zombie Workspace. Cleaner's per-iteration sweep, the `crew cleanup` CLI, and `setupWorkspace`'s rollback path all route through this one operation.

## Workspace

The host-side terminal session that runs an agent for one ticket. Two kinds, one concept:

- **cmux workspace** — a pane/tab in [cmux](https://github.com/clayton-cole/cmux). macOS-only.
- **tmux workspace** — a window inside a dedicated `groundcrew` tmux session. Linux/macOS.

Every provisioned ticket gets one workspace, named with the ticket id (`TEAM-220`). Tracked by ticket, not by worktree kind — there is one workspace per ticket regardless of host vs remote runner.

Lifecycle and lookup live in `src/lib/workspaces.ts`. Callers ask `workspaces.open(spec)` / `workspaces.probe()` / `workspaces.close(name)` and never branch on the kind themselves — the module dispatches via the resolved adapter (`workspaceKind` config + host capabilities). `probe()` returns a typed `WorkspaceProbe` (`{ kind: "ok"; names }` or `{ kind: "unavailable"; error? }`) so callers don't re-invent a sentinel when the adapter binary is flaky.

`groundcrew` opens workspaces in `setupWorkspace`, closes them in `cleaner.runOnce`. Distinct from `worktrees`; do not call a workspace a "worktree."

## Runner

The environment that executes the agent command for a ticket.

- **Local runner** — macOS only. Groundcrew requires `safehouse` on `PATH`, starts `clearance`, and launches the model command through `safehouse-clearance` inside the host worktree.
- **Remote runner** — remote Linux, currently backed by the Sprite provider. Tickets labeled `agent-remote` keep the workspace local but run repository setup and the agent command inside the configured remote runner.

There is no `models.isolation` strategy, Docker Sandboxes runner, or Linux/WSL direct local runner. macOS local runs use the local runner; Linux/WSL users run tickets through the configured remote runner. Legacy `.sbx` worktrees and persistent Docker Sandboxes state are no longer discovered or cleaned up by groundcrew; users remove old state manually with `sbx` if needed.

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

The `BoardIssues` GraphQL filter is scoped server-side on two axes: state name (Todo / In-Progress / Done / extra terminal states) and labels (`labels.some.name.startsWith: "agent-"`). Unlabeled tickets are filtered out by Linear's API and never appear in the board snapshot, so dashboard counts, blocker accounting, and dispatcher selection are all already scoped to groundcrew-eligible work. `fetchResolvedIssue` (manual `crew setup`) does not apply the label filter — it's an explicit per-ticket opt-in and keeps the historic default to `models.default` when the ticket has no `agent-*` label.

The client-side narrowing (`parseModel` returning `undefined`, `Issue.model`/`Issue.repository` typed as `string | undefined`, `GroundcrewIssue` + `isGroundcrewIssue`, the dispatcher's predicate filter) is retained as defense-in-depth against query drift — if the GraphQL filter is ever loosened, the dispatcher still won't pick up unlabeled tickets. In normal operation the narrowing is a no-op.
