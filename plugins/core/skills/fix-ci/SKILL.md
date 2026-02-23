---
name: fix-ci
description: "Analyze and fix CI failures for a GitHub pull request. Use this when CI checks are failing, the build is red, or you need to diagnose GitHub Actions failures. Triggers on: 'fix CI', 'CI is failing', 'checks failed', 'build is broken', 'tests failing in CI', 'why is CI red', or any request to investigate and resolve PR check failures."
argument-hint: "[pr-url]"
---

# Fix CI Failures

Diagnose and fix CI failures for a GitHub pull request by retrieving logs, identifying root causes, and applying targeted fixes.

## Arguments

- `$ARGUMENTS` - GitHub PR URL (e.g., `https://github.com/owner/repo/pull/123`). If omitted, uses the PR for the current branch.

## Instructions

### Step 1: Get PR and Identify Failed Checks

```bash
# If $ARGUMENTS contains a PR URL, extract the PR number from the path.
# Otherwise, get the PR for the current branch:
gh pr view --json number,url,headRefName,statusCheckRollup
```

From `statusCheckRollup`, find checks where `conclusion` is `"failure"` or `state` is `"FAILURE"`. If no checks have failed, report that CI is green and stop.

When multiple checks failed, prioritize **build/compile checks over test checks** — build errors are often the root cause of downstream test failures, so fixing them first may resolve multiple failures at once.

### Step 2: Retrieve Failed Job Logs

Extract the run ID from the failed check's `detailsUrl` (the numeric suffix of the GitHub Actions URL, e.g., `.../actions/runs/123456789`).

```bash
# List failed job IDs for the run
gh run view $RUN_ID --json jobs --jq '.jobs[] | select(.conclusion == "failure") | .databaseId'

# Get only failed step output (concise)
gh run view --job $JOB_ID --log-failed
```

Start with `--log-failed` because it shows only the output from failed steps, cutting through potentially thousands of lines of passing output. Only fall back to `--log` with targeted grep if `--log-failed` doesn't provide enough context.

When parsing large log output, focus on:

- **The first error message** — later failures often cascade from this
- **Summary lines** like "Test Suites:", "FAILED", build error counts
- **Stack traces** immediately after assertion or compilation errors

### Step 3: Diagnose Root Cause

Read the relevant source files and tests to understand the failure in context.

**Build/compilation errors** — type errors, missing imports, syntax issues. These block everything else.
**Test failures** — read both the failing test and the code it exercises. The fix could be in either place; don't assume the test is wrong just because it's failing.
**Lint/format errors** — usually auto-fixable with project formatting tools.
**Infrastructure issues** — missing env vars, CI config problems, dependency resolution failures.

### Step 4: Present Findings and Proposed Fix

Before changing code, present:

1. **Root cause** — what's failing and why
2. **Proposed fix** — which files to change and what the changes are

Then ask the user whether to proceed. This confirmation step matters because CI failures can be ambiguous — what looks like a test bug might actually be the test correctly catching a real regression.

### Step 5: Apply Fix and Verify

After approval, implement the changes. Then run the relevant checks locally (build, test, lint for the affected project/files) to verify the fix before pushing. Report the local results.

### Failure Patterns

**Removed code but tests still reference it:** Delete or update the tests. Check for leftover references in shared test fixtures or configurations.

**Missing mocks/providers after adding a dependency:** Add the mock to test module setup. Update existing mocks when signatures change.

**Type errors from interface changes:** Fix in the changed files. If the type change is intentional, update downstream consumers too.

**Snapshot mismatches:** Check if the change is expected (you modified rendering/output). If so, update snapshots. If not, investigate the regression.

**Flaky/intermittent failures:** If the test passes locally, the failure looks timing-dependent, or it's unrelated to the PR's changes, flag this to the user rather than making speculative changes.

## Input

Pull Request URL: $ARGUMENTS
