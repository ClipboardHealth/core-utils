# Core Plugin <!-- omit from toc -->

Clipboard's core development tools.

## Table of contents <!-- omit from toc -->

- [Installation](#installation)
- [Recommended plugins](#recommended-plugins)
  - [claude-plugins-official](#claude-plugins-official)
  - [anthropics/claude-code](#anthropicsclaude-code)

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

/plugin install typescript-lsp@claude-plugins-official
/plugin install code-simplifier@claude-plugins-official
```

### [anthropics/claude-code](https://github.com/anthropics/claude-code/blob/main/.claude-plugin/marketplace.json)

```bash
/plugin marketplace add anthropics/claude-code

/plugin install code-review@anthropics/claude-code
/plugin install commit-commands@anthropics/claude-code
```
