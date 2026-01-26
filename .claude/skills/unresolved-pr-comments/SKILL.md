---
name: unresolved-pr-comments
description: Get unresolved review comments from a GitHub pull request
argument-hint: "[pr-number]"
---

# Unresolved PR Comments

Fetch and analyze unresolved review comments from a GitHub pull request.

## Usage

Run the script to fetch PR comment data:

```bash
node ".claude/skills/unresolved-pr-comments/unresolvedPrComments.ts" [pr-number] 2>/dev/null
```

If no PR number is provided, it uses the PR associated with the current branch.

Note: Limited to 100 review threads, 10 comments per thread, and 100 reviews.

## Processing Instructions

Using the JSON output from the script:

1. **If error**: Display the error message and suggest the fix
2. **If no comments**: Report the PR has no pending feedback
3. **If comments exist**: Present a brief summary (e.g., "Found 3 unresolved comments and 5 nitpicks")

Then, for EVERY comment (both `unresolvedComments` AND `nitpickComments`):

1. Read the relevant code at the file path and line number
2. Assess the comment and provide your opinion:
   - **Agree**: Explain why and offer to fix it
   - **Disagree**: Explain why the current code is acceptable
   - **Already fixed**: Note that the code already addresses this concern
3. Present your assessment in list format (renders reliably in terminals):

   **1. `src/api.ts:118`** - Wrap JSON.parse in try-catch
   **Verdict: Already fixed** - Try-catch added in recent commit

   **2. `src/config.ts:23`** - Use `const` instead of `let`
   **Verdict: Disagree** - Value is reassigned on L31

   **3. `src/utils.ts:42`** - Add null check for user input
   **Verdict: Agree** - Input isn't validated, could cause runtime error

Then, offer to fix any issues where you agreed.
