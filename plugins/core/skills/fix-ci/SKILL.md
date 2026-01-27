---
name: fix-ci
description: Analyze and fix CI failures for a GitHub pull request
argument-hint: "[pr-url]"
---

# Fix CI Errors

Analyze and fix CI failures for a GitHub pull request.

## Arguments

- `$ARGUMENTS` - The GitHub pull request URL (e.g., `https://github.com/owner/repo/pull/123`)

If no PR URL is provided, it uses the PR associated with the current branch.

## Instructions

You are tasked with identifying and fixing CI failures for the provided pull request.

### Step 0: Resolve PR Number

If a PR URL is provided in `$ARGUMENTS`, extract the PR number from it. Otherwise, get the PR for the current branch:

```bash
# If no PR URL provided, get PR for current branch
gh pr view --json number,url,headRefName
```

This will return the PR associated with the current branch. If a URL was provided, extract the PR number from the URL path (e.g., `https://github.com/owner/repo/pull/123` → PR number is `123`).

### Step 1: Get PR Information and CI Status

Use the GitHub CLI to get the PR details and check status:

```bash
gh pr view $PR_NUMBER --json title,headRefName,statusCheckRollup,url
```

Identify any failed checks from the `statusCheckRollup`. The `statusCheckRollup` contains check details including `detailsUrl` which links to the GitHub Actions run.

### Step 2: Get Failed Job Logs

Extract the run ID from the failed check's `detailsUrl` (e.g., `https://github.com/owner/repo/actions/runs/123456789` → run ID is `123456789`).

Then get the failed jobs and stream their logs directly:

```bash
# Get failed job IDs from the run
gh run view $RUN_ID --json jobs --jq '.jobs[] | select(.conclusion == "failure") | .databaseId'

# Stream logs for a specific failed job and search for errors
gh run view --job $JOB_ID --log | grep -iE "FAIL|Error:|error:|Test Suites:|Tests:"

# Or view only failed steps' logs (more concise)
gh run view --job $JOB_ID --log-failed
```

Analyze the log output to identify the specific errors causing CI to fail.

### Step 3: Identify Root Cause

Analyze the error messages to determine:

- Is it a compilation error (TypeScript, build failure)?
- Is it a test failure?
- Is it an infrastructure/configuration issue?

For test failures, identify:

- Which test files are failing
- What assertions are failing
- Whether tests reference code/endpoints that were modified or removed

### Step 4: Present Plan and Wait for Approval

Before making any changes, present:

1. **Root Cause**: Clear explanation of why CI is failing
2. **Affected Files**: List of files that need to be modified
3. **Proposed Changes**: Specific changes to fix the issue

Ask the user: "Do you want me to proceed with these changes?"

### Step 5: Implement Fixes (After Approval)

Only after user approval:

1. Make the necessary code changes
2. Run the affected tests locally to verify the fix
3. Report the test results

### Common CI Failure Patterns

**Removed endpoint/feature but tests remain:**

- Delete test files that test removed functionality
- Remove references from shared test configurations (e.g., endpoint constants, test matrices)

**Missing mocks/providers:**

- Add missing provider mocks to test module setup
- Update unit test mocks for new dependencies

**TypeScript compilation errors:**

- Fix type errors in the changed files
- Update interfaces/types as needed

**Test assertion failures:**

- Update test expectations to match new behavior
- Fix test data setup if needed

## Input

Pull Request URL: $ARGUMENTS
