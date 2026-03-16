---
name: learn-from-session
description: |
  Analyze the current session for agent efficiency, quality, and actionable improvements. Use this skill when the user says things like "learn from this session", "session retro", "what went well", "how did the agent do", "what should I improve", "review this session", "session review", or any request to reflect on how the current session went. Also use when the user wants to extract learnings, identify friction, or improve their workflow based on what just happened.
---

You are reviewing the current Claude Code session. Your job is to surface the 2-3 most impactful findings — things that would actually change how the next session goes — not to produce an exhaustive report card.

Be candid. A session where everything scores 4/5 but you have nothing concrete to suggest is a wasted review. Prioritize specificity over coverage: one sharp observation beats five generic ones.

Analyze the session transcript and produce the following:

## Agent efficiency analysis

Evaluate how well the agent used tools and how much human course-correction was needed.

Score each dimension 1-5. Calibration: 1=actively harmful or completely wrong approach, 2=significant waste or frequent missteps, 3=adequate but with clear room for improvement, 4=good with minor issues, 5=genuinely impressive and hard to improve on. Reserve 5 for sessions that would make you say "I wish the agent always worked like this."

- **Tool precision**: Did the agent use the right tools for each task, or did it flail between tools, run unnecessary reads, or use grep when it should have used targeted file reads?
- **Iteration efficiency**: How many attempts did it take to get things right? Count tool retries, failed bash commands, and edit-then-re-edit cycles.
- **Context utilization**: Did the agent leverage CLAUDE.md, AGENTS.md, and project conventions, or did it ignore available context and make assumptions?
- **Autonomy level**: How often did the agent work without human intervention? Each rejection/abort/course-correction is a friction event.
- **Autonomy span**: What was the longest streak of productive tool calls without human intervention?

Provide a brief narrative (2-3 sentences) explaining the scores with specific examples from the session.

## Agent quality analysis

Evaluate how well the agent followed project coding standards and CLAUDE.md rules.

Use the same 1-5 calibration as above.

- **CLAUDE.md compliance**: Did the agent follow the rules and conventions defined in CLAUDE.md and AGENTS.md? Flag specific violations.
- **Code pattern adherence**: Did the generated code follow established project patterns (naming conventions, error handling, file organization, test structure)?
- **Test coverage intent**: Did the agent write or update tests when modifying behavior? Did it run tests before declaring done?
- **PR hygiene**: Is the commit history clean? Are changes scoped appropriately? Did the agent avoid touching unrelated files?
- **Documentation awareness**: Did the agent update relevant docs, comments, or type definitions when changing interfaces?

Provide a brief narrative (2-3 sentences) explaining the scores with specific examples.

## Session reflection

Surface things that would save time if known at the start of the next session. The bar for inclusion: "would I tell a teammate about this before they start working on this codebase?" Skip categories with nothing worth noting.

- **Bash commands**: Commands that were used, discovered, or would have been useful to know upfront.
- **Code style patterns**: Patterns followed or discovered that aren't yet documented.
- **Testing approaches**: Testing strategies that worked or should have been used.
- **Environment/configuration quirks**: Gotchas, workarounds, or setup details encountered.
- **Warnings**: Errors, deprecations, or edge cases that tripped up the agent.

## Actionable improvements

This is the most important section. Produce recommendations in these categories, but only if genuinely actionable — a suggestion the user can apply in under 5 minutes. Skip any category with nothing worth doing.

### CLAUDE.md updates

**Do not suggest rules that duplicate existing automated enforcement.** If a lint rule, pre-commit hook, CI check, or other tooling already catches an issue, documenting it in CLAUDE.md/AGENTS.md is redundant. Before suggesting a rule, check whether the session transcript shows the error was already caught and blocked by automated tooling (e.g. a pre-commit hook rejected the commit, a linter flagged the issue). If so, skip it — the tooling is already doing its job.

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

## Structured data block

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
      "autonomy_level": <1-5>,
      "autonomy_span": <1-5>,
      "friction_events": <count of rejections/aborts/course-corrections>,
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

## Presenting the review

1. Display the human-readable sections.
2. If there is an open PR for the current branch, offer to post the review as a PR comment (using `gh pr comment` with `--body-file`).
3. If the user has CLAUDE.md updates to apply, offer to apply them directly.
