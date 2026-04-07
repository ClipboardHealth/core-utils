#!/usr/bin/env bash
set -euo pipefail

export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Install NVM if not present
if [ ! -d "$HOME/.nvm" ]; then
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
fi

# Source NVM (works in non-interactive shells)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# Install and use the version pinned in .nvmrc
nvm install
nvm use

# Persist the updated PATH (with correct node/npm) into subsequent Claude tool calls
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  append_once() {
    local line="$1"
    grep -Fqx -- "$line" "$CLAUDE_ENV_FILE" 2>/dev/null || echo "$line" >> "$CLAUDE_ENV_FILE"
  }

  append_once "export NVM_DIR=\"$HOME/.nvm\""
  append_once ". \"\$NVM_DIR/nvm.sh\""
  append_once "export PATH=\"$(dirname "$(nvm which current)"):\$PATH\""
  append_once "export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true"
fi

# Install deps
npm clean-install
