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

### Step 1: Get PR Information and CI Status

Use the GitHub CLI to get the PR details and check status:

```bash
gh pr view <PR_NUMBER> --json title,headRefName,statusCheckRollup,url
```

Identify any failed checks from the `statusCheckRollup`.

### Step 2: Get Failed Job Logs

For each failed job, download and analyze the logs:

```bash
# Get the run ID from the failed check URL
gh run view <RUN_ID> --json jobs | jq '.jobs[] | select(.conclusion == "failure")'

# Download logs as zip and extract
gh api repos/<OWNER>/<REPO>/actions/runs/<RUN_ID>/logs > /tmp/ci-logs.zip
unzip -o /tmp/ci-logs.zip -d /tmp/ci-logs/

# Search for errors in the logs
grep -rE "FAIL|Error:|error:|Test Suites:|Tests:" /tmp/ci-logs/
```

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
