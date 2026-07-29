# Core Plugin <!-- omit from toc -->

Clipboard's core development tools.

## Table of contents <!-- omit from toc -->

- [Installation](#installation)
- [Prerequisites](#prerequisites)
- [Remote sessions](#remote-sessions)

## Installation

```bash
# Add the marketplace
/plugin marketplace add ClipboardHealth/core-utils

# Install the plugin
/plugin install core@clipboard --scope user
```

## Prerequisites

- [GitHub CLI](https://cli.github.com/) (`gh`)

## Remote sessions

The `SessionStart` hook ensures `gh` is available in Claude Code remote sessions. If `gh` is
missing and `GITHUB_TOKEN` is set, the hook installs it under `~/.local/bin`.
