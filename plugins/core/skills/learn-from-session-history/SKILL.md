---
name: learn-from-session-history
description: Analyze my Claude Code local session history and suggest CLAUDE.md, hook, skill, agent, or permission revisions
argument-hint: "[project-name or 'all']"
---

## Scope

$ARGUMENTS

- Blank or "all": analyze all projects
- Project name/path: analyze only that project

## File Locations

| Path                                                       | Contents          |
| ---------------------------------------------------------- | ----------------- |
| `~/.claude/projects/<hash>/*.jsonl`                        | Conversation logs |
| `~/.claude/projects/<hash>/<session-id>/subagents/*.jsonl` | Subagent logs     |
| `~/.claude/projects/<hash>/sessions-index.json`            | Session metadata  |
| `~/.claude/projects/<hash>/settings.local.json`            | Project settings  |

## JSONL Structure

Each line is a JSON object with different structures:

- `.message.content[]` - incremental messages (one per line)
- `.data.normalizedMessages[]` - **cumulative history** (contains all prior messages)

Always filter out `normalizedMessages` to avoid over-counting:

```bash
rg -v '"normalizedMessages"'
```

Key content `type` values within `.message.content[]`:

- `"tool_use"` → fields: `name`, `input` (tool name and parameters)
- `"tool_result"` → fields: `tool_use_id`, `content`
- `"text"` → assistant text responses

## Analysis

Analyze my session history for:

1. Repeated permission denials
2. Tool calls that failed then succeeded with different approaches
3. Commands blocked by hooks
4. Multi-step patterns that could be simplified

Output actionable recommendations:

1. `CLAUDE.md` rules to add
2. Hooks, skills, or slash commands to create

## Extraction Patterns

```bash
# Count all tool usage
rg --files ~/.claude/projects -g "*.jsonl" | head -300 | \
  xargs cat 2>/dev/null | rg -v '"normalizedMessages"' | rg '"tool_use"' | \
  rg -o '"name":"[^"]*"' | sort | uniq -c | sort -rn

# Tool call sequences (what tools follow what)
rg --files ~/.claude/projects -g "*.jsonl" | head -300 | \
  xargs cat 2>/dev/null | rg -v '"normalizedMessages"' | rg '"tool_use"' | rg -o '"name":"[^"]*"' | \
  awk 'NR>1{print prev" -> "$0} {prev=$0}' | sort | uniq -c | sort -rn | head -30

# Common Bash commands
rg --files ~/.claude/projects -g "*.jsonl" | head -300 | xargs cat 2>/dev/null | \
  rg -v '"normalizedMessages"' | \
  rg '"tool_use".*"name":"Bash"' -A 10 | rg '"command"' | \
  rg -o '"command":"[^"]*"' | sed 's/"command":"//' | sed 's/"$//' | \
  sort | uniq -c | sort -rn | head -30

# Common git subcommands
rg --files ~/.claude/projects -g "*.jsonl" | head -300 | xargs cat 2>/dev/null | \
  rg -v '"normalizedMessages"' | \
  rg '"tool_use".*"name":"Bash"' -A 10 | rg '"command"' | \
  rg -o '"command":"[^"]*"' | rg '^"command":"git ' | \
  rg -o 'git [a-z-]+' | sort | uniq -c | sort -rn

# Common Glob patterns
rg --files ~/.claude/projects -g "*.jsonl" | head -300 | xargs cat 2>/dev/null | \
  rg -v '"normalizedMessages"' | \
  rg '"tool_use".*"name":"Glob"' -A 5 | rg '"pattern"' | \
  rg -o '"pattern":"[^"]*"' | sort | uniq -c | sort -rn | head -20

# Most read files (by filename, with counts for redundancy detection)
rg --files ~/.claude/projects -g "*.jsonl" | head -300 | xargs cat 2>/dev/null | \
  rg -v '"normalizedMessages"' | \
  rg '"tool_use".*"name":"Read"' -A 5 | rg '"file_path"' | \
  rg -o '[^/]+$' | sed 's/"$//' | sort | uniq -c | sort -rn | head -20
```

## Error Analysis Patterns

```bash
# All errors (excluding warmup noise)
rg --files ~/.claude/projects -g "*.jsonl" | head -300 | \
  xargs cat 2>/dev/null | rg -v '"normalizedMessages"' | \
  rg '"is_error":true' | rg -v 'Warmup' | head -50

# Bash exit code errors
rg --files ~/.claude/projects -g "*.jsonl" | head -300 | \
  xargs cat 2>/dev/null | rg -v '"normalizedMessages"' | \
  rg -o '"content":"Exit code [^"]*"' | \
  sort | uniq -c | sort -rn | head -30

# Edit tool "string not found" errors
rg --files ~/.claude/projects -g "*.jsonl" | head -300 | \
  xargs cat 2>/dev/null | rg -v '"normalizedMessages"' | \
  rg 'String to replace not found' | head -20

# Hook blocking messages
rg --files ~/.claude/projects -g "*.jsonl" | head -300 | \
  xargs cat 2>/dev/null | rg -v '"normalizedMessages"' | \
  rg -o 'Blocked: [^"\\]+' | sort | uniq -c | sort -rn

# User rejections and interruptions
rg --files ~/.claude/projects -g "*.jsonl" | head -300 | \
  xargs cat 2>/dev/null | rg -v '"normalizedMessages"' | \
  rg '"doesn.t want to proceed|rejected.*tool|interrupted"' | wc -l

# File not found / path errors
rg --files ~/.claude/projects -g "*.jsonl" | head -300 | \
  xargs cat 2>/dev/null | rg -v '"normalizedMessages"' | \
  rg 'No such file or directory|ENOENT' | head -20
```

## Lint Error Analysis

```bash
# TypeScript-ESLint rule violations (ranked)
rg --files ~/.claude/projects -g "*.jsonl" | head -300 | xargs cat 2>/dev/null | \
  rg -v '"normalizedMessages"' | \
  rg '"tool_result"' | rg -io '@typescript-eslint/[a-z0-9-]+' | \
  sort | uniq -c | sort -rn | head -15

# TypeScript error codes with messages
rg --files ~/.claude/projects -g "*.jsonl" | head -300 | xargs cat 2>/dev/null | \
  rg -v '"normalizedMessages"' | \
  rg '"tool_result"' | rg -o 'TS[0-9]+:[^"\\]*' | \
  sort | uniq -c | sort -rn | head -20

# Linter race conditions (file modified during edit)
rg --files ~/.claude/projects -g "*.jsonl" | head -300 | xargs cat 2>/dev/null | \
  rg -v '"normalizedMessages"' | \
  rg '"tool_result"' | rg -c 'File has been modified since read'

# ESLint no-* rule violations
rg --files ~/.claude/projects -g "*.jsonl" | head -300 | xargs cat 2>/dev/null | \
  rg -v '"normalizedMessages"' | \
  rg '"tool_result"' | rg -o "no-[a-z-]+" | \
  sort | uniq -c | sort -rn | head -20

# Import rule violations
rg --files ~/.claude/projects -g "*.jsonl" | head -300 | xargs cat 2>/dev/null | \
  rg -v '"normalizedMessages"' | \
  rg '"tool_result"' | rg -o "import/[a-z-]+" | \
  sort | uniq -c | sort -rn | head -15

# Full lint error messages containing specific terms
rg --files ~/.claude/projects -g "*.jsonl" | head -300 | xargs cat 2>/dev/null | \
  rg -v '"normalizedMessages"' | \
  rg -o '"content":"[^"]*lint[^"]*error[^"]*"' | head -30
```

## Context Efficiency Analysis

```bash
# Count summarization events (context overflow triggers)
rg --files ~/.claude/projects -g "*.jsonl" | head -300 | xargs cat 2>/dev/null | \
  rg -o '"type":"summary"' | wc -l

# Sessions with highest token usage
rg --files ~/.claude/projects -g "*.jsonl" | head -300 | xargs cat 2>/dev/null | \
  rg -o 'cache_read_input_tokens":[0-9]+' | rg -o '[0-9]+' | sort -rn | head -10

# "Output too large" warnings (truncated results)
rg --files ~/.claude/projects -g "*.jsonl" | head -300 | xargs cat 2>/dev/null | \
  rg 'Output too large' | wc -l

# Anti-pattern: cat/head/tail instead of Read tool
rg --files ~/.claude/projects -g "*.jsonl" | head -300 | xargs cat 2>/dev/null | \
  rg '"name":"Bash"' -A 10 | rg '"command":"(cat |head |tail )' | wc -l
```

## Notes

- Use Bash for file discovery (`~` doesn't expand with Glob tool)
- Project directory names are path hashes (e.g., `-Users-username-path-to-project`)
- Use `head -300` on file lists to prevent memory issues on large histories
- `2>/dev/null` suppresses file access errors for cleaner output
