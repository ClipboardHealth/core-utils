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

# Get installation status and configuration in one pass
read -r STATUS < <(node -e "
  const path = require('path');
  const fs = require('fs');

  const projectPath = path.resolve('$PROJECT_DIR');
  const pkgPath = path.join(projectPath, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  if (!deps['$PACKAGE_NAME']) {
    console.log('not-installed');
    process.exit();
  }

  try {
    require.resolve('$PACKAGE_NAME/package.json', { paths: [projectPath] });
  } catch {
    console.log('not-in-node-modules');
    process.exit();
  }

  const scripts = pkg.scripts || {};
  const hasSyncScript = 'sync-ai-rules' in scripts;
  const postinstallCallsSync = (scripts.postinstall || '').includes('sync-ai-rules');

  console.log(hasSyncScript && postinstallCallsSync ? 'configured' : 'incomplete');
" 2>/dev/null || echo "not-installed")

case "$STATUS" in
  not-installed)
    output_message "$PACKAGE_NAME is not installed. Ask the user if they'd like to install it. If approved, fetch $README_URL and follow the Quick Start instructions. Ask the user which profile to use."
    ;;
  not-in-node-modules)
    output_message "$PACKAGE_NAME is listed in package.json but not installed in node_modules. Ask the user if they'd like to run \\\`npm install\\\` to install dependencies."
    ;;
  incomplete)
    output_message "$PACKAGE_NAME is installed but not fully configured (missing sync-ai-rules script or postinstall hook). Ask the user if they'd like to configure it. If approved, fetch $README_URL and follow the Quick Start instructions to add the missing configuration. Ask the user which profile to use."
    ;;
esac
