---
description: Fetch unresolved review comments from a GitHub pull request
argument-hint: [pr-number]
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/get-review-comments.sh:*)
---

Fetch and display unresolved review comments from a pull request.

## Data

!`"${CLAUDE_PLUGIN_ROOT}/scripts/get-review-comments.sh" $1 2>&1`

## Instructions

Using the JSON data above:

1. **If error**: Display the error message and suggest the fix
2. **If no unresolved comments**: Report the PR has no pending feedback
3. **If comments exist**: Present them grouped by file, showing:
   - File path and line number
   - Author and timestamp
   - Comment body (summarize if lengthy)

After presenting comments, offer to help address any of them.
