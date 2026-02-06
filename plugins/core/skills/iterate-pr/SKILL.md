---
name: iterate-pr
description: Iteratively commit, push, and address PR feedback until CI passes and comments are resolved
argument-hint: "[max-iterations]"
---

# Iterate PR

Autonomously iterate on a pull request until CI checks pass and all comments are resolved. Each iteration runs in a fresh subagent.

## Arguments

- `$ARGUMENTS` - Maximum iterations (default: 3)

## Instructions

### Step 1: Initialize

Parse max iterations from `$ARGUMENTS` (default: 3). Set iteration counter to 0.

### Step 2: Check State

Get the PR for the current branch:

!`gh pr view --json number,url,headRefName,statusCheckRollup 2>/dev/null || echo "NO_PR"`

**If no PR exists:** Proceed to Step 3 (first iteration will create one).

**If PR exists:** Get unresolved comments data:

!`node "${CLAUDE_PLUGIN_ROOT}/skills/unresolved-pr-comments/unresolvedPrComments.ts" 2>/dev/null`

Parse the JSON output and evaluate exit conditions.

**Exit with success** when all conditions are met:

- All CI checks pass (no failures in statusCheckRollup)
- No unresolved comments (totalUnresolvedComments == 0)
- No nitpicks (totalNitpicks == 0)

**JSON Structure for Exit Evaluation:**

```json
{
  "totalUnresolvedComments": number,
  "totalNitpicks": number,
  "unresolvedComments": [...],
  "nitpickComments": [...]
}
```

Check `totalUnresolvedComments == 0` and `totalNitpicks == 0` for exit condition.

Report: "PR is clean! All CI checks pass and no unresolved comments."

**Exit with status report** when iteration counter >= max iterations:

- List failing CI checks
- List unresolved comment/nitpick counts
- Suggest running `/iterate-pr` again to continue

### Step 3: Spawn Iteration Subagent

Spawn a Task subagent with `subagent_type: "general-purpose"` using this prompt:

> Handle one iteration of the PR feedback loop:
>
> 1. **Record Starting Commit**: !`git rev-parse HEAD` (save as `startCommit`)
> 2. **Commit and Push**: Invoke `core:commit-push-pr` via the Skill tool
> 3. **Get PR Number**: !`gh pr view --json number --jq '.number'`
> 4. **Wait for CI**: !`gh pr checks --watch`
> 5. **Check CI Status**: !`gh pr checks --json name,state,bucket`
>    - If any check has `bucket: "fail"`, invoke `core:fix-ci` via the Skill tool, report what was fixed, and exit
> 6. **Check Comments**: Get unresolved comments:
>    !`node "${CLAUDE_PLUGIN_ROOT}/skills/unresolved-pr-comments/unresolvedPrComments.ts" 2>/dev/null`
>    - If unresolved comments or nitpicks exist, for EVERY comment:
>      1. Read the relevant code at the file path and line number
>      2. Assess the comment with an explicit verdict:
>         - **Agree**: Explain why, then fix it
>         - **Disagree**: Explain why the current code is acceptable; do NOT change the code
>         - **Already fixed**: Note that the code already addresses this concern
>      3. After assessing all comments, fix only those you agreed with and exit (next iteration will commit fixes)
> 7. **Report**: Include whether commits were made (!`git rev-parse HEAD` != `startCommit`), PR status, CI status, and comments addressed

### Step 4: Loop

After the subagent completes:

1. Increment iteration counter
2. If no commits were made this iteration:
   - Get unresolved comments: !`node "${CLAUDE_PLUGIN_ROOT}/skills/unresolved-pr-comments/unresolvedPrComments.ts" 2>/dev/null`
   - If unresolved comments remain, exit with: "Comments addressed, awaiting reviewer resolution. Run `/iterate-pr` after reviewer responds."
3. Report: "Iteration [N]/[max] complete. Checking state..."
4. Return to Step 2

## Examples

**Successful completion:**

```text
Iteration 1/3: No PR exists
> commit-push-pr -> PR #347 created
> CI failed (lint errors) -> fix-ci -> fixed missing semicolons

Iteration 2/3: CI failures remain
> commit-push-pr -> pushed fixes
> CI passed, 2 review comments
> unresolved-pr-comments -> addressed null check, const usage

Iteration 3/3: Comments pending
> commit-push-pr -> pushed fixes
> CI passed, no unresolved comments

PR is clean! All CI checks pass and no unresolved comments.
```

**Awaiting reviewer resolution:**

```text
Iteration 1/3: PR exists with comments
> commit-push-pr -> pushed comment fixes
> CI passed, 1 comment remains (disagreed with suggestion)

Iteration 2/3: No commits made, comments remain

Comments addressed, awaiting reviewer resolution. Run `/iterate-pr` after reviewer responds.
```

## Input

Maximum iterations: $ARGUMENTS
