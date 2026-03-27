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
node scripts/unresolvedPrComments.ts [pr-number]
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
3. Assess each comment against the current code. When multiple comments appear at the same file and line, they are part of the same review thread — read them together as a conversation
4. Group your assessment as follows:

   **Should address**
   - Description of the comment with file path(s)
     - Why it's a real issue (bug, a11y, UX, etc.)

   **Can ignore**
   - Description of the comment with file path(s)
     - Why: already fixed, not actionable, not worth addressing in this PR, etc.

   **Net**
   Summary of how many are worth fixing and what kind of issues they are. Offer to fix, but **do NOT start until the user confirms**.
