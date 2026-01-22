# Core Plugin <!-- omit from toc -->

Clipboard's core development tools.

## Table of contents <!-- omit from toc -->

- [Installation](#installation)
- [Hooks](#hooks)
  - [SessionStart: check-ai-rules](#sessionstart-check-ai-rules)
- [Skills](#skills)
  - [local-package](#local-package)
- [Recommended plugins](#recommended-plugins)
  - [claude-plugins-official](#claude-plugins-official)

## Installation

```bash
# Add the marketplace
/plugin marketplace add ClipboardHealth/core-utils

# Install the plugin
/plugin install core@clipboard --scope user
```

## Hooks

### SessionStart: check-ai-rules

Validates that [`@clipboard-health/ai-rules`](../../packages/ai-rules/README.md) is installed and configured in the current project. If issues are found, it prompts to install or configure the project.

## Skills

### local-package

Use Clipboard's internal CLI (`@clipboard-health/cli`) to link and unlink packages across repositories for local development. Invoke with `/local-package` or let Claude auto-trigger when discussing local package development.

See [`skills/local-package/SKILL.md`](skills/local-package/SKILL.md) for usage details.

## Recommended plugins

### [claude-plugins-official](https://github.com/anthropics/claude-plugins-official/blob/main/.claude-plugin/marketplace.json)

```bash
/plugin marketplace add claude-plugins-official

/plugin install commit-commands@claude-plugins-official --scope user
/plugin install code-simplifier@claude-plugins-official --scope user

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
