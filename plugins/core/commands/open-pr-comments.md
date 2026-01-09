---
description: Get unresolved review comments from a GitHub pull request
argument-hint: [pr-number]
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/open-pr-comments.sh:*)
---

Fetch and display unresolved review comments from a pull request.

Note: Limited to 100 review threads and 10 comments per thread.

## Data

!`"${CLAUDE_PLUGIN_ROOT}/scripts/open-pr-comments.sh" "${1:-}"`

## Instructions

Using the JSON data above:

1. **If error**: Display the error message and suggest the fix
2. **If no unresolved comments**: Report the PR has no pending feedback
3. **If comments exist**: Present them grouped by file, showing:
   - File path and line number
   - Author and timestamp
   - Comment body (summarize if lengthy)

After presenting comments, offer to review the code for each of them and decide whether you agree or disagree and why.
