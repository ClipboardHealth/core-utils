# Core Plugin <!-- omit from toc -->

Clipboard's core development tools.

## Table of contents <!-- omit from toc -->

- [Installation](#installation)
- [Prerequisites](#prerequisites)
- [Skills](#skills)
  - [babysit-pr](#babysit-pr)
  - [cognito-user-analysis](#cognito-user-analysis)
  - [commit-push-pr](#commit-push-pr)
  - [datadog-investigate](#datadog-investigate)
  - [flaky-test-debugger](#flaky-test-debugger)
  - [learn-from-session](#learn-from-session)
  - [local-package](#local-package)
  - [seed-data](#seed-data)
  - [simplify](#simplify)
- [Syncing external plugins](#syncing-external-plugins)
  - [Adding a new repository](#adding-a-new-repository)
  - [Keeping in sync](#keeping-in-sync)
- [Recommended plugins](#recommended-plugins)
  - [claude-plugins-official](#claude-plugins-official)

## Installation

```bash
# Add the marketplace
/plugin marketplace add ClipboardHealth/core-utils

# Install the plugin
/plugin install core@clipboard --scope user
```

## Prerequisites

- [GitHub CLI](https://cli.github.com/) (`gh`) — used by CI check and PR skills
- GNU coreutils `timeout` — used by `babysit-pr` for CI watch timeout

  ```bash
  # macOS (via Homebrew)
  brew install coreutils
  ```

## Skills

### babysit-pr

Watch a PR through CI and review feedback: commit/push, wait for CI, auto-fix high-confidence failures, reply to active review threads, and summarize CodeRabbit review-body comments. Invoke with `/babysit-pr` (one pass) or `/babysit-pr 2m` (best-effort same-turn polling).

Supersedes the deprecated `fix-ci`, `iterate-pr`, and `unresolved-pr-comments` skills.

### cognito-user-analysis

Analyze and fix duplicate Cognito users by comparing against backend data. Useful for diagnosing 403 Forbidden errors, duplicate accounts sharing phone/email, and orphaned UNCONFIRMED signups. Invoke with `/cognito-user-analysis`.

### commit-push-pr

Commit changes, push to origin, and create a PR in one step. Invoke with `/commit-push-pr`.

### datadog-investigate

Investigate production issues by querying Datadog logs, metrics, and APM traces, then correlating findings with the codebase. Invoke with `/datadog-investigate` or by mentioning production errors, latency spikes, error rates, or trace IDs.

### flaky-test-debugger

Debug and fix flaky Playwright E2E tests using Playwright reports and Datadog. Invoke with `/flaky-test-debugger` or when investigating intermittent test failures.

### learn-from-session

Analyze the current session for agent efficiency, quality, and actionable improvements. Produces scored dimensions, a session reflection, and concrete suggestions for CLAUDE.md updates, hooks, skills, and prompt techniques. Invoke with `/learn-from-session`.

### local-package

Use Clipboard's internal CLI (`@clipboard-health/cli`) to link and unlink packages across repositories for local development. Invoke with `/local-package` or let Claude auto-trigger when discussing local package development.

See [`skills/local-package/SKILL.md`](skills/local-package/SKILL.md) for usage details.

### seed-data

Trigger the `Generate Seed Data` GitHub Actions workflow to create test data (HCPs, facilities, shifts) in development, staging, or prod-shadow environments. Invoke with `/seed-data` or by asking to seed/create test data.

### simplify

Review all changed files for reuse, quality, and efficiency, then fix any issues found. Launches parallel review agents for dead code, library reuse, and code quality. Invoke with `/simplify`.

## Syncing external plugins

This plugin syncs components from external repositories using a sync script. This works around the limitation that [Claude Code plugins do not support dependencies](https://github.com/anthropics/claude-code/issues/9444).

To run the sync:

```bash
npm run sync-plugins
```

### Adding a new repository

Edit [`syncPlugins.ts`](../../scripts/syncPlugins.ts) and add an entry to `SYNC_CONFIG`:

```typescript
{
  repo: "https://github.com/your-org/your-plugins-repo.git",
  ref: "main",            // Optional: branch, tag, or commit SHA
  pluginsPath: "plugins", // Optional: path to plugins dir (default: "plugins")
  plugins: [
    {
      name: "plugin-name",
      components: [
        { source: { type: "agents", name: "agent-name" } },
        { source: { type: "skills", name: "skill-name" } },
        { source: { type: "hooks", name: "hook-name" } },
      ],
    },
  ],
}
```

### Keeping in sync

Run `npm run sync-plugins` periodically or when upstream repositories have changes you want to pull in.

## Recommended plugins

### [claude-plugins-official](https://github.com/anthropics/claude-plugins-official/blob/main/.claude-plugin/marketplace.json)

```bash
/plugin marketplace add claude-plugins-official

/plugin install commit-commands@claude-plugins-official --scope user

# === Fullstack ===

# Helpful MCP servers. Restart after install and run `/mcp` to authenticate.
# Note: GitHub MCP exists, but having Claude use `gh` CLI is more context efficient.
/plugin install linear@claude-plugins-official --scope user
/plugin install Notion@claude-plugins-official --scope user
# Note: typescript-lsp@claude-plugins-official exists; as of 2026-01-12, Serena is more powerful.
# See https://github.com/oraios/serena/issues/858
/plugin install serena@claude-plugins-official --scope user

# === Frontend ===

# Note: Playwright MCP exists, but having Claude use `npx playwright` CLI is more context efficient.
/plugin install figma@claude-plugins-official --scope user
```
