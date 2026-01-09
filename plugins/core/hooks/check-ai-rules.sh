#!/usr/bin/env bash
# Hook: Ensure @clipboard-health/ai-rules is installed and up to date
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
PACKAGE_NAME="@clipboard-health/ai-rules"
README_URL="https://raw.githubusercontent.com/ClipboardHealth/core-utils/main/packages/ai-rules/README.md"

output_message() {
  printf '{\n  "result": "continue",\n  "message": "%s"\n}\n' "$1"
}

[[ ! -f "$PROJECT_DIR/package.json" ]] && exit 0
command -v node >/dev/null 2>&1 || {
  output_message "Node.js was not found, so $PACKAGE_NAME could not be validated. If this is a JavaScript/TypeScript repo, ask the user if they'd like to install Node.js (or run this check from an environment with Node)."
  exit 0
}

# Get installation status and configuration in one pass
read -r STATUS < <(
  PROJECT_DIR="$PROJECT_DIR" PACKAGE_NAME="$PACKAGE_NAME" node - <<'NODE' 2>/dev/null || echo "not-installed"
const path = require('path');
const fs = require('fs');

const projectDir = process.env.PROJECT_DIR || '.';
const packageName = process.env.PACKAGE_NAME;

const projectPath = path.resolve(projectDir);
const pkgPath = path.join(projectPath, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
if (!deps[packageName]) {
  console.log('not-installed');
  process.exit(0);
}

try {
  require.resolve(`${packageName}/package.json`, { paths: [projectPath] });
} catch {
  console.log('not-in-node-modules');
  process.exit(0);
}

const scripts = pkg.scripts || {};
const hasSyncScript = Object.prototype.hasOwnProperty.call(scripts, 'sync-ai-rules');
const postinstallCallsSync = (scripts.postinstall || '').includes('sync-ai-rules');

console.log(hasSyncScript && postinstallCallsSync ? 'configured' : 'incomplete');
NODE
)

case "$STATUS" in
  configured)
    # 👍
    ;;
  not-installed)
    output_message "$PACKAGE_NAME is not installed. Ask the user if they'd like to install it. If approved, fetch $README_URL and follow the Quick Start instructions. Ask the user which profile to use."
    ;;
  not-in-node-modules)
    output_message "$PACKAGE_NAME is listed in package.json but not installed in node_modules. Ask the user if they'd like to run \`npm install\` to install dependencies."
    ;;
  incomplete)
    output_message "$PACKAGE_NAME is installed but not fully configured (missing sync-ai-rules script or postinstall hook). Ask the user if they'd like to configure it. If approved, fetch $README_URL and follow the Quick Start instructions to add the missing configuration. Ask the user which profile to use."
    ;;
esac
