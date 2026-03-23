# Core Plugin <!-- omit from toc -->

Clipboard's core development tools.

## Table of contents <!-- omit from toc -->

- [Installation](#installation)
- [Prerequisites](#prerequisites)
- [Skills](#skills)
  - [commit-push-pr](#commit-push-pr)
  - [fix-ci](#fix-ci)
  - [iterate-pr](#iterate-pr)
  - [local-package](#local-package)
  - [revise-claude-md](#revise-claude-md)
  - [learn-from-session](#learn-from-session)
  - [seed-data](#seed-data)
  - [unresolved-pr-comments](#unresolved-pr-comments)
  - [write-bug-ticket](#write-bug-ticket)
  - [write-feature-ticket](#write-feature-ticket)
  - [write-tech-debt-ticket](#write-tech-debt-ticket)
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
- GNU coreutils `timeout` — used by `iterate-pr` for CI watch timeout

  ```bash
  # macOS (via Homebrew)
  brew install coreutils
  ```

## Skills

### commit-push-pr

Commit changes, push to origin, and create a PR in one step. Invoke with `/commit-push-pr`.

### fix-ci

Analyze and fix CI failures for a GitHub pull request. Invoke with `/fix-ci` or `/fix-ci <pr-url>`.

### iterate-pr

Autonomously iterate on a pull request until CodeRabbit review passes and all CI checks succeed. Each iteration commits changes, waits for CI, and addresses feedback. Invoke with `/iterate-pr` or `/iterate-pr <max-iterations>`.

### learn-from-session

Analyze the current session for agent efficiency, quality, and actionable improvements. Produces scored dimensions, a session reflection, and concrete suggestions for CLAUDE.md updates, hooks, skills, and prompt techniques. Invoke with `/learn-from-session`.

### local-package

Use Clipboard's internal CLI (`@clipboard-health/cli`) to link and unlink packages across repositories for local development. Invoke with `/local-package` or let Claude auto-trigger when discussing local package development.

See [`skills/local-package/SKILL.md`](skills/local-package/SKILL.md) for usage details.

### revise-claude-md

Review the current session for learnings and update CLAUDE.md with context that would help future sessions. Invoke with `/revise-claude-md`.

### seed-data

Trigger the `Generate Seed Data` GitHub Actions workflow to create test data (HCPs, facilities, shifts) in development, staging, or prod-shadow environments. Invoke with `/seed-data` or by asking to seed/create test data.

### unresolved-pr-comments

Fetch and analyze unresolved review comments from a GitHub pull request. Invoke with `/unresolved-pr-comments` or `/unresolved-pr-comments <pr-number>`.

### write-bug-ticket

Draft Linear bug report tickets from user reports, customer complaints, monitoring alerts, or production investigation. Searches Datadog for evidence, checks for duplicates in Linear, and presents a draft for review before creating. Invoke with `/write-bug-ticket`.

### write-feature-ticket

Draft Linear feature request tickets from conversation context, descriptions, or code/PR analysis. Clarifies the problem, assesses scope for sub-issue decomposition, and presents a draft for review before creating. Invoke with `/write-feature-ticket`.

### write-tech-debt-ticket

Draft Linear tech debt tickets from code review, PR comments, codebase audits, or post-incident findings. Classifies debt type, gathers evidence (Datadog for perf/reliability, git history for maintainability), assesses interest and risk, and presents a draft for review before creating. Invoke with `/write-tech-debt-ticket`.

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
