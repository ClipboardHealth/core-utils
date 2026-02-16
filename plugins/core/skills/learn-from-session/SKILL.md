---
name: session-review
description: Analyze the current session for agent efficiency, quality, and actionable improvements
---

You are a session review agent analyzing the current Claude Code session transcript. Your job is to produce a concise, actionable review covering agent efficiency, agent quality, and concrete improvements for future sessions.

Analyze the session transcript and produce the following:

## Agent efficiency analysis

Evaluate how well the agent used tools and how much human course-correction was needed.

Score each dimension 1-5 (1=poor, 5=excellent):

- **Tool precision**: Did the agent use the right tools for each task, or did it flail between tools, run unnecessary reads, or use grep when it should have used targeted file reads?
- **Iteration efficiency**: How many attempts did it take to get things right? Count tool retries, failed bash commands, and edit-then-re-edit cycles.
- **Context utilization**: Did the agent leverage CLAUDE.md, AGENTS.md, and project conventions, or did it ignore available context and make assumptions?
- **Human intervention rate**: How often did the user need to course-correct, reject tool calls, abort operations, or redirect the agent? Each rejection/abort is a friction event.
- **Autonomy span**: What was the longest streak of productive tool calls without human intervention? Longer spans indicate better agent calibration.

Provide a brief narrative (2-3 sentences) explaining the scores with specific examples from the session.

## Agent quality analysis

Evaluate how well the agent followed project coding standards and CLAUDE.md rules.

Score each dimension 1-5:

- **CLAUDE.md compliance**: Did the agent follow the rules and conventions defined in CLAUDE.md and AGENTS.md? Flag specific violations.
- **Code pattern adherence**: Did the generated code follow established project patterns (naming conventions, error handling, file organization, test structure)?
- **Test coverage intent**: Did the agent write or update tests when modifying behavior? Did it run tests before declaring done?
- **PR hygiene**: Is the commit history clean? Are changes scoped appropriately? Did the agent avoid touching unrelated files?
- **Documentation awareness**: Did the agent update relevant docs, comments, or type definitions when changing interfaces?

Provide a brief narrative (2-3 sentences) explaining the scores with specific examples.

## Session reflection

Review the session for missing context and discoveries that would help future sessions:

- **Bash commands**: Commands that were used, discovered, or would have been useful to know upfront.
- **Code style patterns**: Patterns followed or discovered that aren't yet documented.
- **Testing approaches**: Testing strategies that worked or should have been used.
- **Environment/configuration quirks**: Gotchas, workarounds, or setup details encountered.
- **Warnings**: Errors, deprecations, or edge cases that tripped up the agent.

## Actionable improvements

Based on the full analysis, produce recommendations in these categories. Skip any category with nothing actionable.

### CLAUDE.md updates

For each suggestion, specify whether it belongs in:

- **Team-shared** (checked into git, e.g. `./CLAUDE.md` or `./AGENTS.md`)
- **Personal/local** (git-ignored, e.g. `~/.claude/CLAUDE.md`)

Format each as a ready-to-paste diff:

```diff
+ [the addition - keep it brief]
```

### Hooks, skills, or agents

Suggest new or revised hooks, skills, or agents that would have prevented issues or improved the workflow.

### Prompt technique

One concrete thing the engineer could do differently in their prompts to get better results (be specific, not generic).

### Agent pattern note

One observation about how the agent behaved that the team should know about — a strength to replicate or a weakness to work around.

## STRUCTURED DATA BLOCK

After the human-readable review, emit a fenced JSON block that a scraper can parse:

```json
{
  "session_review": {
    "version": "1.1",
    "timestamp": "<ISO 8601>",
    "efficiency": {
      "tool_precision": <1-5>,
      "iteration_efficiency": <1-5>,
      "context_utilization": <1-5>,
      "human_intervention_rate": <1-5>,
      "autonomy_span": <1-5>,
      "friction_events": <count of rejections/aborts/redirects>,
      "total_tool_calls": <count>,
      "failed_tool_calls": <count>
    },
    "quality": {
      "claude_md_compliance": <1-5>,
      "code_pattern_adherence": <1-5>,
      "test_coverage_intent": <1-5>,
      "pr_hygiene": <1-5>,
      "documentation_awareness": <1-5>,
      "violations": ["<brief description of each CLAUDE.md violation>"]
    },
    "improvements": {
      "claude_md_rules": ["<each suggested rule, ready to paste>"],
      "hooks_skills_agents": ["<each suggestion>"],
      "prompt_technique": "<the suggestion>",
      "agent_pattern_note": "<the observation>"
    }
  }
}
```

## INSTRUCTIONS FOR PRESENTING TO USER

After generating the review:

1. Display the human-readable sections to the user.
2. If there is an open PR for the current branch, ask: 'Would you like me to add this as a comment on the PR? The structured JSON block will be included for your team's aggregation pipeline.'
3. If the user agrees, run: gh pr comment <PR_NUMBER> --repo <REPO> --body '<the full review including JSON block>'
4. If the user declines, say: 'No problem. The review is in your session transcript if you want it later.'
