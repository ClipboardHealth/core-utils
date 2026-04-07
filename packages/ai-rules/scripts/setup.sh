#!/usr/bin/env bash
set -euo pipefail

export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Install NVM if not present
if [ ! -d "$HOME/.nvm" ]; then
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
fi

# Source NVM (works in non-interactive shells)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# Install and use the version pinned in .nvmrc
nvm install
nvm use

# Persist the updated PATH (with correct node/npm) into subsequent Claude tool calls
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export NVM_DIR=\"$HOME/.nvm\"" >> "$CLAUDE_ENV_FILE"
  echo ". \"\$NVM_DIR/nvm.sh\"" >> "$CLAUDE_ENV_FILE"
  echo "export PATH=\"$(nvm which current | xargs dirname):\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi

# Install deps
npm clean-install
