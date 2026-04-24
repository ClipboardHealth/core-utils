---
name: unresolved-pr-comments
description: "DEPRECATED — use /babysit-pr instead. Kept only so invocations about PR feedback, review comments, unresolved threads, CodeRabbit review-body comments, 'check my PR', 'what's left on my PR', or 'resolve comments' surface a deprecation notice."
---

# unresolved-pr-comments (deprecated)

This skill is deprecated and will be removed soon. It has been superseded by [`/babysit-pr`](../babysit-pr/SKILL.md), which fetches and classifies unresolved review threads and CodeRabbit review-body comments as part of its loop (see steps 4, 6, and 7 of the babysit-pr skill). The `unresolvedPrComments.sh` script now lives in `plugins/core/skills/babysit-pr/scripts/`.

## What to do

Tell the user:

> `unresolved-pr-comments` is deprecated and will be removed soon. Run `/babysit-pr` instead — it fetches unresolved review threads and CodeRabbit review-body comments, classifies each by scope, and posts sentinel-tagged replies.

Then stop. Do not run any comment-fetching logic from this skill.
