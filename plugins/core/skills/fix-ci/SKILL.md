---
name: fix-ci
description: "DEPRECATED — use /babysit-pr instead. Kept only so invocations like 'fix CI', 'CI is failing', 'checks failed', 'build is broken', 'tests failing in CI', 'why is CI red' surface a deprecation notice."
---

# fix-ci (deprecated)

This skill is deprecated and will be removed soon. It has been superseded by [`/babysit-pr`](../babysit-pr/SKILL.md), which handles CI failures inline (fetches failed logs, diagnoses build/lint/test failures conservatively, applies high-confidence fixes) in addition to review feedback.

## What to do

Tell the user:

> `fix-ci` is deprecated and will be removed soon. Run `/babysit-pr` instead — it diagnoses and fixes CI failures as part of its loop (see step 5 of the babysit-pr skill).

Then stop. Do not run any CI diagnosis logic from this skill.
