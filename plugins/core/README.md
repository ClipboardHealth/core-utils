# Core Plugin <!-- omit from toc -->

Clipboard's core development tools.

## Table of contents <!-- omit from toc -->

- [Installation](#installation)
- [Hooks](#hooks)
  - [SessionStart: check-ai-rules](#sessionstart-check-ai-rules)
- [Commands](#commands)
  - [/unresolved-pr-comments](#unresolved-pr-comments)
- [Recommended plugins](#recommended-plugins)
  - [claude-plugins-official](#claude-plugins-official)

## Installation

```bash
# Add the marketplace
/plugin marketplace add ClipboardHealth/core-utils

# Install the plugin
/plugin install core@clipboard

# Update the marketplace
/plugin marketplace update clipboard
```

## Hooks

### SessionStart: check-ai-rules

Validates that [`@clipboard-health/ai-rules`](../../packages/ai-rules/README.md) is installed and configured in the current project. If issues are found, it prompts to install or configure the project.

## Commands

### /unresolved-pr-comments

Fetches and displays unresolved review comments from a GitHub pull request. Limited to 100 review threads and 10 comments per thread.

```bash
/unresolved-pr-comments [pr-number]
```

Claude Code offers to review the corresponding code and give its opinion.

## Recommended plugins

### [claude-plugins-official](https://github.com/anthropics/claude-plugins-official/blob/main/.claude-plugin/marketplace.json)

```bash
/plugin marketplace add claude-plugins-official

/plugin install commit-commands@claude-plugins-official
/plugin install code-review@claude-plugins-official
/plugin install code-simplifier@claude-plugins-official
/plugin install typescript-lsp@claude-plugins-official

# Optional MCP servers
# After adding them, restart Claude Code and then run `/mcp` to authenticate them.
# Note: While Github and Playwright exist, having Claude use their CLIs is more context efficient.
/plugin install linear@claude-plugins-official
/plugin install Notion@claude-plugins-official
/plugin install figma@claude-plugins-official
```
