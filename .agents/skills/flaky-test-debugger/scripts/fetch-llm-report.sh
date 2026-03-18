#!/usr/bin/env bash
set -euo pipefail

# Fetches the playwright-llm-report artifact from a GitHub Actions run.
# Uses the run ID in both the zip filename and extract directory so parallel
# downloads from different agents don't collide.
#
# Usage: fetch-llm-report.sh <github-actions-url>
# Example: fetch-llm-report.sh 'https://github.com/Org/Repo/actions/runs/123/attempts/1'

url="${1:-}"

if [[ -z "$url" ]]; then
  echo "Usage: fetch-llm-report.sh <github-actions-url>" >&2
  exit 1
fi

# Parse owner, repo, and run ID from the URL
if [[ "$url" =~ github\.com/([^/]+)/([^/]+)/actions/runs/([0-9]+) ]]; then
  owner="${BASH_REMATCH[1]}"
  repo="${BASH_REMATCH[2]}"
  run_id="${BASH_REMATCH[3]}"
else
  echo "Error: Could not parse GitHub Actions URL: $url" >&2
  exit 1
fi

echo "Repo: ${owner}/${repo}, Run ID: ${run_id}"

# Find the playwright-llm-report artifact ID
artifact_json=$(gh api "repos/${owner}/${repo}/actions/runs/${run_id}/artifacts" \
  --jq '.artifacts[] | select(.name == "playwright-llm-report") | {id, name, size_in_bytes, expired}')

if [[ -z "$artifact_json" ]]; then
  echo "Error: No 'playwright-llm-report' artifact found for run ${run_id}" >&2
  echo "Available artifacts:" >&2
  gh api "repos/${owner}/${repo}/actions/runs/${run_id}/artifacts" \
    --jq '.artifacts[].name' >&2
  exit 1
fi

artifact_id=$(echo "$artifact_json" | jq -r '.id')
expired=$(echo "$artifact_json" | jq -r '.expired')
size=$(echo "$artifact_json" | jq -r '.size_in_bytes')

if [[ "$expired" == "true" ]]; then
  echo "Error: Artifact has expired and is no longer available." >&2
  exit 1
fi

echo "Found artifact: id=${artifact_id}, size=${size} bytes"

# Download and extract using run ID for isolation
out_dir="/tmp/playwright-llm-report-${run_id}"
zip_path="${out_dir}.zip"

# Skip download if already extracted (avoids duplicate work in multi-agent runs)
if [[ -d "$out_dir" ]] && ls "$out_dir"/*.json &>/dev/null; then
  echo "Already downloaded — skipping."
  echo ""
  echo "Report directory: ${out_dir}"
  exit 0
fi

echo "Downloading to: ${zip_path}"
tmp_zip="${zip_path}.tmp"
gh api "repos/${owner}/${repo}/actions/artifacts/${artifact_id}/zip" > "$tmp_zip" && mv "$tmp_zip" "$zip_path"

echo "Extracting to: ${out_dir}"
mkdir -p "$out_dir"
unzip -o "$zip_path" -d "$out_dir"
rm -f "$zip_path"

echo ""
echo "Done! Files:"
ls -la "$out_dir"
echo ""
echo "Report directory: ${out_dir}"
