import type { Config } from "./src/lib/config.js";

export const config: Config = {
  linear: {
    // Project URL slug to scope polling. Copy the trailing segment of
    // your Linear project URL —
    //   https://linear.app/<workspace>/project/<projectSlug>
    // — verbatim, for example "ai-strategy-5152195762f3". The 12-char hex
    // tail is the canonical ID groundcrew uses, so the orchestrator stays
    // resilient across project renames and across same-name projects in
    // different teams. The leading name segment keeps `config.ts`
    // self-documenting at a glance.
    projectSlug: "your-project-name-0123456789ab",
    // statuses: { todo: "Todo", inProgress: "In Progress", done: "Done", terminal: ["Done"] },
  },
  workspace: {
    // Parent directory under which groundcrew clones repositories and
    // creates per-ticket worktrees.
    projectDir: "~/dev/groundcrew",
    // Repositories groundcrew is allowed to set up worktrees in. Add
    // `<owner>/<repo>` or bare `<repo>` entries; the orchestrator scopes
    // tickets to these and refuses unknown repos by default.
    knownRepositories: ["your-org/your-repo"],
  },
  // Everything below is optional — defaults shown for reference. Uncomment
  // and edit to override.
  //
  // git: { remote: "origin", defaultBranch: "main" },
  //
  // orchestrator: {
  //   maximumInProgress: 4,
  //   pollIntervalMilliseconds: 120_000,
  //   sessionLimitPercentage: 85,
  // },
  //
  // models: {
  //   default: "claude",
  //   // Additive: defaults for `claude` and `codex` are merged in unless you
  //   // re-declare those keys here. Add a third agent (e.g. `cursor`) by
  //   // dropping it in this map and tagging tickets with `agent-cursor`.
  //   // Local runs on macOS are always wrapped with Safehouse/clearance.
  //   // Linux/WSL users should label tickets `agent-remote` to use Sprite.
  //   definitions: {
  //     cursor: {
  //       cmd: "cursor-agent",
  //       color: "#929292",
  //     },
  //   },
  // },
  //
  // prompts: {
  //   initial: [
  //     "Begin work on {{ticket}} ({{title}}) in the {{worktree}} wt subdirectory.",
  //     "",
  //     "Ticket description:",
  //     "",
  //     "{{description}}",
  //   ].join("\n"),
  // },
  //
  // // Terminal session manager. "auto" picks cmux when on PATH, else tmux.
  // // Set explicitly to "cmux" or "tmux" to fail loudly when the chosen
  // // backend is missing. tmux windows live in a dedicated `groundcrew`
  // // session and lose status-pill painting (cmux-only feature).
  // workspaceKind: "auto",
  //
  // remote: {
  //   sprite: {
  //     // Tickets labeled `agent-remote` run through this shared Sprite.
  //     spriteName: "crew-claude-1",
  //     // Bare repository names are cloned as `${owner}/${repo}` inside the Sprite.
  //     owner: "ClipboardHealth",
  //     // Absolute paths inside the Sprite. Groundcrew creates one shared clone
  //     // per repo and one remote git worktree per ticket.
  //     repoRoot: "/home/sprite/dev",
  //     worktreeRoot: "/home/sprite/groundcrew/worktrees",
  //     // Build-only env vars forwarded for remote dependency setup, then
  //     // unset before the agent process starts.
  //     secretNames: ["NPM_TOKEN", "BUF_TOKEN"],
  //   },
  // },
  //
  // logging: {
  //   // Append-mode log file destination. `log()` / `logEvent()` tee here
  //   // in addition to stdout, so a vanished workspace doesn't take the
  //   // evidence with it. Default: `${XDG_STATE_HOME:-~/.local/state}/groundcrew/groundcrew.log`.
  //   file: "~/Library/Logs/groundcrew/groundcrew.log",
  // },
};
