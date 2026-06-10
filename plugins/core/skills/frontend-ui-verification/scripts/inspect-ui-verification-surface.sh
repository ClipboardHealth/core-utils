#!/usr/bin/env bash
# cspell:ignore dockerless
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  inspect-ui-verification-surface.sh inspect
  inspect-ui-verification-surface.sh storybook-command
  inspect-ui-verification-surface.sh storybook-build-command
  inspect-ui-verification-surface.sh storybook-test-command
  inspect-ui-verification-surface.sh component-test-command
  inspect-ui-verification-surface.sh storybook-url <story-id>
  inspect-ui-verification-surface.sh storybook-iframe-url <story-id>
  inspect-ui-verification-surface.sh figma-story-files

Environment:
  STORYBOOK_PORT  Storybook port to use for URL commands. Defaults to 6006.
EOF
}

if git rev-parse --show-toplevel >/dev/null 2>&1; then
  repo_root="$(git rev-parse --show-toplevel)"
else
  repo_root="$PWD"
fi

cd "$repo_root"

command="${1:-inspect}"
storybook_port="${STORYBOOK_PORT:-6006}"

script_from_package_json() {
  node -e '
const fs = require("fs");
const names = process.argv.slice(1);
if (!fs.existsSync("package.json")) process.exit(1);
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const scripts = pkg.scripts || {};
for (const name of names) {
  if (scripts[name]) {
    console.log(`npm run ${name}`);
    process.exit(0);
  }
}
process.exit(1);
' "$@"
}

storybook_script() {
  node -e '
const fs = require("fs");
if (!fs.existsSync("package.json")) process.exit(1);
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const scripts = pkg.scripts || {};
if (!scripts.storybook) process.exit(1);
console.log("npm run storybook");
'
}

storybook_build_script() {
  script_from_package_json "build-storybook" "storybook:build"
}

storybook_test_script() {
  script_from_package_json "test-storybook" "storybook:test" "test:storybook" "test:a11y" "a11y"
}

component_test_script() {
  script_from_package_json \
    "test:playwright:ct-dockerless" \
    "test:playwright:ct" \
    "test:playwright:ct-update-screenshots" \
    "test:ct" \
    "test:ct:local" \
    "ct:local"
}

figma_story_files() {
  files="$(
    for root in src/appV2/redesign src/appV2 src components app; do
      if [ -d "$root" ]; then
        find "$root" -name "*.stories.tsx" -o -name "*.stories.ts" -o -name "*.stories.mdx"
      fi
    done | sort -u
  )"

  if [ -z "$files" ]; then
    return 0
  fi

  printf "%s\n" "$files" | while IFS= read -r file; do
    if grep -Eq 'figma\.com|design:[[:space:]]*\{' "$file"; then
      printf "%s\n" "$file"
    fi
  done | head -n 80
}

case "$command" in
  inspect)
    ;;
  storybook-command)
    storybook_script
    exit 0
    ;;
  storybook-build-command)
    storybook_build_script
    exit 0
    ;;
  storybook-test-command)
    storybook_test_script
    exit 0
    ;;
  component-test-command)
    component_test_script
    exit 0
    ;;
  storybook-url)
    if [ "${2:-}" = "" ]; then
      echo "Missing story id." >&2
      usage >&2
      exit 2
    fi
    printf "http://localhost:%s/?path=/story/%s\n" "$storybook_port" "$2"
    exit 0
    ;;
  storybook-iframe-url)
    if [ "${2:-}" = "" ]; then
      echo "Missing story id." >&2
      usage >&2
      exit 2
    fi
    printf "http://localhost:%s/iframe.html?viewMode=story&id=%s\n" "$storybook_port" "$2"
    exit 0
    ;;
  figma-story-files)
    figma_story_files
    exit 0
    ;;
  --help|-h|help)
    usage
    exit 0
    ;;
  *)
    echo "Unknown command: $command" >&2
    usage >&2
    exit 2
    ;;
esac

echo "Repository: $repo_root"

if [ -f package.json ]; then
  echo
  echo "Relevant package scripts:"
  node -e '
const fs = require("fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const scripts = pkg.scripts || {};
for (const name of [
  "storybook",
  "build-storybook",
  "storybook:build",
  "test-storybook",
  "storybook:test",
  "test:storybook",
  "test:a11y",
  "a11y",
  "test:playwright:ct-dockerless",
  "test:playwright:ct",
  "test:playwright:ct-update-screenshots",
  "test:ct",
  "test:ct:local",
  "ct:local",
  "test:v2",
  "lint",
  "lint:v2",
  "typecheck",
  "typecheck:v2",
]) {
  if (scripts[name]) console.log(`- ${name}: ${scripts[name]}`);
}
'
fi

echo
echo "Deterministic Storybook commands:"
if storybook_command="$(storybook_script 2>/dev/null)"; then
  echo "- Start: $storybook_command"
  echo "- Default URL: http://localhost:${storybook_port}/"
else
  echo "- Start: no storybook script detected"
fi
if storybook_build_command="$(storybook_build_script 2>/dev/null)"; then
  echo "- Build: $storybook_build_command"
else
  echo "- Build: no Storybook build script detected"
fi
if storybook_test_command="$(storybook_test_script 2>/dev/null)"; then
  echo "- Storybook test/a11y: $storybook_test_command"
else
  echo "- Storybook test/a11y: no native script detected"
fi
if component_test_command="$(component_test_script 2>/dev/null)"; then
  echo "- Component browser test: $component_test_command"
else
  echo "- Component browser test: no native script detected"
fi
echo "- Story URL: $0 storybook-url <story-id>"
echo "- Canvas URL: $0 storybook-iframe-url <story-id>"

echo
echo "Changed UI-related files:"
changed_files="$(
  {
    git diff --name-only HEAD -- 2>/dev/null || true
    git ls-files --others --exclude-standard 2>/dev/null || true
  } | sort -u
)"
if [ -n "$changed_files" ]; then
  ui_files="$(printf "%s\n" "$changed_files" | grep -E '(\.tsx?$|\.stories\.(tsx?|jsx?)$|\.mdx$|\.css$|\.scss$)' || true)"
  if [ -n "$ui_files" ]; then
    printf "%s\n" "$ui_files" | sed "s#^#- #"
  else
    echo "- No changed UI files detected."
  fi
else
  echo "- No tracked changes relative to HEAD."
fi

echo
echo "Storybook files near common Clipboard frontend roots:"
story_files="$(
  for root in src/appV2/redesign src components app; do
    if [ -d "$root" ]; then
      find "$root" -name "*.stories.tsx" -o -name "*.stories.ts" -o -name "*.stories.mdx"
    fi
  done | sort -u | head -n 80
)"
if [ -n "$story_files" ]; then
  printf "%s\n" "$story_files" | sed "s#^#- #"
else
  echo "- No Storybook files found in common roots."
fi

echo
echo "Figma tooling hints:"
if [ -f ".storybook/main.ts" ] && grep -q "@storybook/addon-designs" ".storybook/main.ts"; then
  echo "- Storybook addon-designs detected in .storybook/main.ts"
fi
echo "- When a Figma URL exists, fetch screenshot and design context before coding."
echo "- Figma story files: $0 figma-story-files"

figma_files="$(figma_story_files)"
if [ -n "$figma_files" ]; then
  echo
  echo "Story files with Figma/design references:"
  printf "%s\n" "$figma_files" | sed "s#^#- #"
fi

echo
echo "Suggested verification ladder:"
if storybook_command="$(storybook_script 2>/dev/null)"; then
  echo "1. Run: $storybook_command"
  echo "2. Open the changed story at http://localhost:${storybook_port}/"
  echo "3. If the Storybook shell is noisy, open the iframe canvas URL."
  echo "4. Use Browser, Chrome, or Playwright to capture mobile and desktop screenshots."
  echo "5. If native storybook/component test commands are detected, use them for isolated interaction or a11y checks."
  echo "6. If rendering fails, fix story decorators/fixtures before product integration."
else
  echo "1. No storybook script detected. Use the repo's documented visual preview surface."
  echo "2. Use Browser, Chrome, or Playwright to capture screenshots from that surface."
  echo "3. If rendering fails, fix isolated fixtures/providers before product integration."
fi
