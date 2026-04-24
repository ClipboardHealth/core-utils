---
name: iterate-pr
description: "DEPRECATED — use /babysit-pr instead. Kept only so invocations like 'iterate on my PR', 'make this PR pass', 'fix everything on the PR', 'get this PR ready to merge', or 'keep going until CI is green' surface a deprecation notice."
---

# iterate-pr (deprecated)

This skill is deprecated and will be removed soon. It has been superseded by [`/babysit-pr`](../babysit-pr/SKILL.md), which watches a PR through CI and review feedback (commit/push, wait for CI, auto-fix high-confidence failures, reply to active review threads, summarize CodeRabbit review-body comments) in a single self-contained skill.

## What to do

Tell the user:

> `iterate-pr` is deprecated and will be removed soon. Run `/babysit-pr` instead — it handles the same commit → CI → review-feedback loop without spawning subagents. Pass a short interval like `/babysit-pr 2m` for best-effort same-turn polling, or wrap it in `/loop` for longer cadences.

Then stop. Do not run any iteration logic from this skill.
