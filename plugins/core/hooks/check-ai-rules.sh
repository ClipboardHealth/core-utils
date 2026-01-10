#!/usr/bin/env bash
# Hook: Ensure @clipboard-health/ai-rules is installed and up to date
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
PACKAGE_NAME="@clipboard-health/ai-rules"
README_URL="https://raw.githubusercontent.com/ClipboardHealth/core-utils/main/packages/ai-rules/README.md"

output_message() {
  local msg="$1"
  msg=${msg//\\/\\\\}
  msg=${msg//\"/\\\"}
  msg=${msg//$'\n'/\\n}
  msg=${msg//$'\r'/\\r}
  msg=${msg//$'\t'/\\t}
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$msg"
}

[[ ! -f "$PROJECT_DIR/package.json" ]] && exit 0
command -v node >/dev/null 2>&1 || {
  output_message "Node.js was not found, so $PACKAGE_NAME could not be validated. If this is a JavaScript/TypeScript repo, ask the user if they'd like to install Node.js (or run this check from an environment with Node)."
  exit 0
}

# Create temp file for JS code (bash 3.2 compatibility - heredocs in process substitutions fail)
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

cat > "$TMP" <<'NODE'
const path = require('path');
const fs = require('fs');

const projectDir = process.env.PROJECT_DIR || '.';
const packageName = process.env.PACKAGE_NAME;
const projectPath = path.resolve(projectDir);
const pkgPath = path.join(projectPath, 'package.json');

let pkg;
try {
  pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
} catch (err) {
  const errorJson = JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: `Could not read or parse package.json: ${err.message}. Please fix the file and try again.`
    }
  });
  console.log(`error ${errorJson}`);
  process.exit(0);
}

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

# Get installation status and configuration in one pass
STATUS=""
ERROR_JSON=""
if ! read -r STATUS ERROR_JSON < <(PROJECT_DIR="$PROJECT_DIR" PACKAGE_NAME="$PACKAGE_NAME" node "$TMP"); then
  output_message "Failed to validate $PACKAGE_NAME (unexpected error running Node)."
  exit 0
fi

case "$STATUS" in
  configured)
    # Package is installed and configured correctly
    ;;
  error)
    # ERROR_JSON is already properly escaped JSON from Node's JSON.stringify
    echo "$ERROR_JSON"
    ;;
  not-installed)
    output_message "$PACKAGE_NAME is not installed. Ask the user if they'd like to install it. If approved, fetch $README_URL and follow the instructions. Ask the user: \"Which profile to use (common, frontend, backend, datamodeling)? See $README_URL for details.\""
    ;;
  not-in-node-modules)
    output_message "$PACKAGE_NAME is listed in package.json but not installed in node_modules. Ask the user if they'd like to run their package manager's install command."
    ;;
  incomplete)
    output_message "$PACKAGE_NAME is installed but not fully configured (missing sync-ai-rules script or postinstall hook). Ask the user: \"Would you like to configure it? Which profile to use (common, frontend, backend, datamodeling)? See $README_URL for details.\". If approved, fetch $README_URL and follow the instructions to add the missing configuration."
    ;;
  *)
    output_message "Unexpected status while validating $PACKAGE_NAME: $STATUS"
    ;;
esac
