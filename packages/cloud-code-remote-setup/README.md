# @clipboard-health/cloud-code-remote-setup

This package installs necessary integrations in Claude Code remote sessions to execute tasks smoothly.

When running in a remote Claude Code environment (detected via `CLAUDE_CODE_REMOTE=true`), this package automatically installs and configures required CLI tools to ensure seamless operation.

## Currently Supported Integrations

- **GitHub CLI (`gh`)**: Automatically downloads and installs the latest version of the GitHub CLI to `~/.local/bin` if not already available.

## Future Roadmap

In the future, environment variables may be introduced to control which applications are installed and configured during remote session setup.

## Table of contents

- [Install](#install)
- [Environment Variables](#environment-variables)
- [Usage](#usage)
- [Claude Code Hook Configuration](#claude-code-hook-configuration)
- [How It Works](#how-it-works)
- [Local development commands](#local-development-commands)

## Install

```bash
npm install @clipboard-health/cloud-code-remote-setup
```

## Environment Variables

| Variable             | Required | Description                                                                                                                                                                |
| -------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE_CODE_REMOTE` | Yes      | Set to `"true"` to enable remote session setup. If not set or set to any other value, the setup will be skipped.                                                           |
| `GITHUB_TOKEN`       | Yes      | Required for `gh` CLI authentication. The GitHub CLI uses this token to authenticate API requests. Without it, many `gh` commands will fail or have limited functionality. |

## Usage

### Programmatic Usage

```typescript
import { setup } from "@clipboard-health/cloud-code-remote-setup";

// Run setup - only executes in remote sessions (when CLAUDE_CODE_REMOTE=true)
const result = await setup();

if (result.isRight) {
  console.log("Setup completed successfully:", result.right.message);
} else {
  console.error("Setup failed:", result.left.message);
}
```

### CLI Usage

You can run the setup directly using `npx`:

```bash
npx @clipboard-health/cloud-code-remote-setup
```

## Claude Code Hook Configuration

To automatically run the setup when a Claude Code remote session starts, add the following to your Claude Code settings (`.claude/settings.json` or global settings):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "npx @clipboard-health/cloud-code-remote-setup"
          }
        ]
      }
    ]
  }
}
```

This hook will execute the setup script at the start of every remote session, ensuring that all required CLI tools are installed and configured before you start working.

## How It Works

1. Checks if running in a remote session via `CLAUDE_CODE_REMOTE` environment variable
2. If not a remote session, returns success immediately (no-op)
3. If a remote session:
   - Checks if `gh` CLI is already installed globally
   - If not, checks if it's available in `~/.local/bin`
   - If not available, downloads the latest release from GitHub and installs it to `~/.local/bin`
   - Verifies the installation by checking if the binary is callable

## Local development commands

See `package.json` scripts for the list of commands.
