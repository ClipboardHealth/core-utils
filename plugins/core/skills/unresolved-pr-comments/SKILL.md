---
name: unresolved-pr-comments
description: "Get unresolved review comments from a GitHub pull request. Use this skill when the user asks about PR feedback, review comments, unresolved threads, what reviewers said, CodeRabbit nitpicks, or wants to address PR review feedback. Also use when the user says 'check my PR', 'what's left on my PR', or 'resolve comments'."
argument-hint: "[pr-number]"
---

# Unresolved PR Comments

Fetch and analyze unresolved review comments from a GitHub pull request.

## Usage

Run the script to fetch PR comment data:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/unresolved-pr-comments/unresolvedPrComments.ts" [pr-number] 2>/dev/null
```

If no PR number is provided, it uses the PR associated with the current branch.

Note: Limited to 100 review threads, 10 comments per thread, and 100 reviews.

## Processing Instructions

Using the JSON output from the script:

1. **If error**: Display the error message and suggest the fix
2. **If no comments**: Report the PR has no pending feedback
3. **If comments exist**: Present a brief summary (e.g., "Found 3 unresolved comments and 5 nitpicks")

Then, for EVERY comment (both `unresolvedComments` AND `nitpickComments`):

1. Group comments by file path and read each file once (not per-comment)
2. If a file no longer exists, note that the comment may be outdated
3. Assess the comment against the current code and provide your opinion:
   - **Agree**: Explain why and offer to fix it
   - **Disagree**: Explain why the current code is acceptable
   - **Already fixed**: Note that the code already addresses this concern
4. When multiple comments appear at the same file and line, they are part of the same review thread — read them together as a conversation and assess the original feedback
5. Present your assessment in list format (renders reliably in terminals):

   **1. `src/api.ts:118`** - Wrap JSON.parse in try-catch
   **Verdict: Already fixed** - Try-catch added in recent commit

   **2. `src/config.ts:23`** - Use `const` instead of `let`
   **Verdict: Disagree** - Value is reassigned on L31

   **3. `src/utils.ts:42`** - Add null check for user input
   **Verdict: Agree** - Input isn't validated, could cause runtime error

Then, offer to fix any issues where you agreed.
