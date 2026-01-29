---
description: Suggest CLAUDE.md, hook, skill, agent, or permission revisions based on learnings from this session
allowed-tools: Read, Edit, Glob
---

Review this session for learnings about working with Claude Code in this codebase. Output actionable recommendations:

1. CLAUDE.md updates that would help future Claude sessions be more effective.
2. Hooks, skills, or agents to create or revise.
3. Settings permission updates.

## Step 1: Reflect

What context was missing that would have helped Claude work more effectively?

- Bash commands that were used or discovered
- Code style patterns followed
- Testing approaches that worked
- Environment/configuration quirks
- Warnings or gotchas encountered

## Step 2: Draft Recommendations

Decide where each addition belongs:

- Team-shared (checked into git)
- Personal/local only (gitignored)

**Keep them concise**. Avoid:

- Verbose explanations
- Obvious information
- One-off fixes unlikely to recur

## Step 3: Show Proposed Changes

For each addition:

```text
### Update: ./CLAUDE.md

**Why:** [one-line reason]

\`\`\`diff
+ [the addition - keep it brief]
\`\`\`
```

## Step 4: Apply with Approval

Ask if the user wants to apply the changes. Only edit files they approve.
