# Core Plugin <!-- omit from toc -->

Clipboard's core development tools.

## Table of contents <!-- omit from toc -->

- [Installation](#installation)
- [Commands](#commands)
  - [/open-pr-comments](#open-pr-comments)
- [Hooks](#hooks)
  - [SessionStart: check-ai-rules](#sessionstart-check-ai-rules)
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

## Commands

### /open-pr-comments

Fetches and displays unresolved review comments from a GitHub pull request. Limited to 100 review threads and 10 comments per thread.

```bash
/open-pr-comments [pr-number]
```

Comments are grouped by file with file path, line number, author, and timestamp. After presenting the comments, Claude offers to review the code and provide analysis.

## Hooks

### SessionStart: check-ai-rules

Validates that [`@clipboard-health/ai-rules`](../../packages/ai-rules/README.md) is installed and configured in the current project. Checks for:

- Package listed in `package.json` dependencies
- Package installed in `node_modules`
- `sync-ai-rules` script defined
- `postinstall` hook calling `sync-ai-rules`

If any issues are found, prompts to install or configure the package.

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
