# Core Plugin <!-- omit from toc -->

Clipboard's core development tools.

## Table of contents <!-- omit from toc -->

- [Installation](#installation)
- [Recommended plugins](#recommended-plugins)
  - [claude-plugins-official](#claude-plugins-official)

## Installation

```bash
# Add the marketplace
/plugin marketplace add ClipboardHealth/core-utils

# Install the plugin
/plugin install core@clipboard
```

## Recommended plugins

### [claude-plugins-official](https://github.com/anthropics/claude-plugins-official/blob/main/.claude-plugin/marketplace.json)

```bash
/plugin marketplace add claude-plugins-official

/plugin install commit-commands@claude-plugins-official
/plugin install code-review@claude-plugins-official
/plugin install code-simplifier@claude-plugins-official
/plugin install typescript-lsp@claude-plugins-official

# Optional MCP servers
# Note: While Github and Playwright exist, having Claude use their CLIs is more context efficient.
/plugin install linear@claude-plugins-official
/plugin install Notion@claude-plugins-official
/plugin install slack@claude-plugins-official
/plugin install figma@claude-plugins-official
```
