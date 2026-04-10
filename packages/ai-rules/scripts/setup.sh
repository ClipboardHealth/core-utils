#!/usr/bin/env bash
set -euo pipefail

# When invoked as a Claude Code SessionStart hook (`CLAUDE_ENV_FILE` set), only run in remote
# environments (`CLAUDE_CODE_REMOTE` set). Direct invocations (e.g., Devin, local) always run.
if [[ -n "${CLAUDE_ENV_FILE:-}" && -z "${CLAUDE_CODE_REMOTE:-}" ]]; then
  exit 0
fi

export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

deps_only=false
if [ "${1:-}" = "--deps-only" ]; then
  deps_only=true
fi

# Portable SHA-256: sha256sum (Linux) -> shasum (macOS Perl) -> sha256 (macOS BSD)
if command -v sha256sum >/dev/null 2>&1; then
  hash256() { sha256sum "$@"; }
elif command -v shasum >/dev/null 2>&1; then
  hash256() { shasum -a 256 "$@"; }
elif command -v sha256 >/dev/null 2>&1; then
  hash256() { sha256 -r "$@"; }
else
  echo "No SHA-256 hash tool found" >&2
  exit 1
fi

# Always operate from repo root
repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"

if [ ! -f package.json ]; then
  echo "No root package.json in $repo_root, skipping install"
  exit 0
fi

# Source NVM only for full bootstrap (not --deps-only, where engineers may not use NVM).
# --no-use avoids auto-activating .nvmrc (which fails if the version isn't installed yet).
if [ "$deps_only" = false ]; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" --no-use
fi

if [ "$deps_only" = false ]; then
  # Install NVM if not present
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" --no-use
  fi

  # Install and use the Node version pinned by .nvmrc
  nvm install
  nvm use >/dev/null

  # Enforce exact Node and npm versions from package.json engines
  engines="$(node -p "try { const e = require('./package.json').engines || {}; (e.node || '') + ' ' + (e.npm || '') } catch { '' }" 2>/dev/null || true)"
  expected_node="${engines%% *}"
  expected_npm="${engines##* }"

  is_exact_version() { [[ "$1" =~ ^[0-9]+(\.[0-9]+){1,2}$ ]]; }

  if [ -n "$expected_node" ] && is_exact_version "$expected_node" && [ "$(node -v | sed 's/^v//')" != "$expected_node" ]; then
    echo "Node version mismatch: Expected $expected_node, got $(node -v)" >&2
    exit 1
  fi

  if [ -n "$expected_npm" ] && is_exact_version "$expected_npm" && [ "$(npm -v)" != "$expected_npm" ]; then
    echo "npm version mismatch: Expected $expected_npm, got $(npm -v)" >&2
    exit 1
  fi
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node not found. Install Node.js or run without --deps-only for full bootstrap." >&2
  exit 1
fi

# Persist environment for subsequent Claude Bash commands.
# Replace our own block each time so PATH does not accumulate stale Node bins.
# Runs after both paths so CLAUDE_ENV_FILE stays consistent regardless of --deps-only.
persist_claude_env() {
  [ -n "${CLAUDE_ENV_FILE:-}" ] || return 0

  local begin="# >>> agent-node-env >>>"
  local end="# <<< agent-node-env <<<"
  local tmp
  tmp="$(mktemp)"

  # Always strip the old block to avoid stale paths
  if [ -f "$CLAUDE_ENV_FILE" ]; then
    awk -v begin="$begin" -v end="$end" '
      $0 == begin { skip=1; next }
      $0 == end   { skip=0; next }
      !skip       { print }
    ' "$CLAUDE_ENV_FILE" > "$tmp"
  else
    : > "$tmp"
  fi

  # Persist only the resolved PATH to the node binary — never source nvm.sh here.
  # Sourcing nvm.sh on every Bash call is fragile (fails if nvm.sh is missing or
  # errors out) and unnecessary since the PATH entry is sufficient for node/npm.
  local node_dir
  {
    echo "$begin"
    if command -v nvm >/dev/null 2>&1 \
      && node_dir="$(dirname "$(nvm which current)" 2>/dev/null)" \
      && [[ -n "${NVM_DIR:-}" ]] \
      && [[ "$node_dir" == "$NVM_DIR"/* ]]; then
      echo "export PATH=\"$node_dir:\$PATH\""
    fi
    echo "export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true"
    echo "$end"
  } >> "$tmp"

  mv "$tmp" "$CLAUDE_ENV_FILE"
}
persist_claude_env

# npm auth for private installs is often injected by a shell wrapper. This
# Bash script does not inherit interactive aliases/functions, so bridge
# install-like commands explicitly when NPM_TOKEN is absent.
run_npm() {
  local npm_args=("$@")

  if [ -n "${NPM_TOKEN:-}" ]; then
    npm "${npm_args[@]}"
    return
  fi

  if command -v op >/dev/null 2>&1 && [ -f "$HOME/.1password.env" ]; then
    echo "NPM_TOKEN not set; running npm ${npm_args[*]} via 1Password env"
    if op run --env-file="$HOME/.1password.env" -- npm "${npm_args[@]}"; then
      return
    fi
    echo "1Password env execution failed; trying other npm fallbacks" >&2
  fi

  local user_shell="${SHELL:-}"
  local shell_name="${user_shell##*/}"
  case "$shell_name" in
    bash|zsh)
      if "$user_shell" -ic 'alias npm >/dev/null 2>&1 || typeset -f npm >/dev/null 2>&1'; then
        echo "NPM_TOKEN not set; running npm ${npm_args[*]} via interactive $shell_name shell"
        "$user_shell" -ic 'npm "$@"' shell "${npm_args[@]}"
        return
      fi
      ;;
  esac

  npm "${npm_args[@]}"
}

actual_node="$(node -v | sed 's/^v//')"
actual_npm="$(npm -v)"

# Use tracked plus current modified and untracked files so new workspace manifests also count.
# Filter to npm-relevant inputs only, and avoid node_modules.
list_fingerprint_files() {
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git ls-files --cached --modified --others --exclude-standard | awk '
      /(^|\/)node_modules\// { next }
      /(^|\/)\.git\// { next }
      /(^|\/)(package\.json|package-lock\.json|npm-shrinkwrap\.json|\.npmrc|\.nvmrc)$/ { print }
    ' | sort -u
  else
    find . \
      \( -name .git -o -name node_modules \) -prune -o \
      \( -name package.json -o -name package-lock.json -o -name npm-shrinkwrap.json -o -name .npmrc -o -name .nvmrc \) \
      -type f -print | sed 's#^\./##' | sort
  fi
}

fingerprint_files="$(list_fingerprint_files)"

cache_dir="${HOME}/.cache/agent-deps"
mkdir -p "$cache_dir"

remote_url="$(git config --get remote.origin.url 2>/dev/null || true)"
repo_id="$(printf '%s\n%s\n' "$repo_root" "$remote_url" | hash256 | awk '{print $1}')"
stamp_file="${cache_dir}/$(basename "$repo_root")-${repo_id}.stamp"

compute_dep_key() {
  {
    printf 'repo_root=%s\n' "$repo_root"
    printf 'remote=%s\n' "$remote_url"
    printf 'node=%s\n' "$actual_node"
    printf 'npm=%s\n' "$actual_npm"
    while IFS= read -r rel; do
      [ -n "$rel" ] || continue
      if [ -f "$rel" ]; then
        hash256 "$rel"
      else
        printf 'MISSING %s\n' "$rel"
      fi
    done <<< "$fingerprint_files"
  } | hash256 | awk '{print $1}'
}

dep_key="$(compute_dep_key)"

need_install=1
if [ -d node_modules ] && [ -f "$stamp_file" ]; then
  old_key="$(cat "$stamp_file" 2>/dev/null || true)"
  if [ "$old_key" = "$dep_key" ]; then
    need_install=0
  fi
fi

if [ "$need_install" -eq 0 ]; then
  echo "Dependencies unchanged for $(basename "$repo_root"), skipping npm ci"
else
  run_npm ci
  printf '%s\n' "$dep_key" > "$stamp_file"
fi
