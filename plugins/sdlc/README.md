# SDLC Plugin

AI-First Software Development Lifecycle workflow automation for Claude Code.

## Overview

This plugin implements an AI-first SDLC workflow where AI moves the bottleneck from writing code to specifying intent and verifying quality. It provides specialized agents that handle different phases of the development lifecycle with clear separation of concerns.

## Workflow Phases

1. **Product Discovery** (`/brief`) - Create product briefs with success criteria
2. **Technical Design** (`/design`) - Draft designs with contracts and rollout plans
3. **Ticket Writing** (`/tickets`) - Break designs into small, ordered tickets
4. **Code Writing** (`/code`) - TDD implementation with Red-Green-Refactor
5. **Code Review** (`/review`) - Open PRs with evidence bundles
6. **Deploy** (`/deploy`) - Merge, monitor, and manage rollouts

## Agents

| Agent                | Purpose                                       |
| -------------------- | --------------------------------------------- |
| `coder`              | TDD implementation (Red-Green-Refactor cycle) |
| `product-manager`    | Handle spec changes when coder is blocked     |
| `code-verifier`      | Type check, lint, and run tests               |
| `critic`             | Negative and edge case testing                |
| `code-reviewer`      | Local code review before PR                   |
| `evidence-bundler`   | Create before/after screenshots and logs      |
| `deployment-monitor` | Monitor rollout and propose rollbacks         |

## Skills

- **sdlc-workflow** - Overall workflow guidance and phase transitions
- **tdd-patterns** - Red-Green-Refactor methodology
- **evidence-bundles** - Creating verification evidence

## Prerequisites

- Linear MCP server configured (for ticket tracking)
- Git repository with standard branch workflow
- CI/CD pipeline configured

## Linear Integration

This plugin uses the Linear MCP server for ticket tracking. Ensure Linear MCP is configured in your Claude Code settings or globally:

```json
{
  "mcpServers": {
    "linear": {
      "command": "npx",
      "args": ["-y", "@anthropic/linear-mcp"],
      "env": {
        "LINEAR_API_KEY": "${LINEAR_API_KEY}"
      }
    }
  }
}
```

Available Linear operations:

- Create and update issues
- List and query issues
- Manage projects and cycles
- Track team workflows

The workflow commands (`/brief`, `/tickets`, etc.) will automatically use Linear for ticket management when available.

## Configuration

Create `.claude/sdlc.local.md` in your project root:

```yaml
---
linear_team_id: "TEAM-ID"
doc_path_pattern: "docs/{YYYY}-{MM}-{feature}/"
rollout_strategy: "gradual" # gradual | immediate | canary
review_threshold: "minor" # minor | all
---
## Project-Specific Notes

Add any project-specific workflow notes here.
```

## Environment Variables

For Linear integration, set:

- `LINEAR_API_KEY` - Your Linear API key

## Installation

```bash
# Install plugin
claude --plugin-dir /path/to/plugins/sdlc

# Or add to .claude/settings.json
{
  "plugins": ["/path/to/plugins/sdlc"]
}
```

## Usage Examples

### Start a new feature

```
/brief Create a new booking cancellation feature
```

### Write technical design

```
/design Based on the booking cancellation brief
```

### Begin implementation

```
/code Implement ticket 01-api-contracts
```

### Open PR with evidence

```
/review Ready for review with evidence bundle
```

## Hooks

The plugin includes hooks to enforce workflow discipline:

### Spec Drift Detection

Prevents accidental modification of specifications:

- Blocks edits to `product-brief.md` files
- Blocks edits to `technical-design.md` files
- Warns when editing shared interface/types files

When blocked, Claude is instructed to delegate to the `product-manager` agent.

### Stop Verification

Before Claude stops on implementation tasks, verifies:

- Tests were written and are passing
- TDD methodology was followed
- No unauthorized spec modifications occurred

## Key Principles

- **Separation of concerns**: Agents cannot validate their own work
- **Humans as final gate**: All production-affecting actions require approval
- **Single source of truth**: Documentation lives in repos as markdown
- **Semi-autonomous**: Agents propose actions and wait for approval
- **Guided TDD**: Encourage test-first development with flexibility

## Project Structure

```
plugins/sdlc/
├── .claude-plugin/
│   └── plugin.json           # Plugin manifest
├── commands/                  # Slash commands
│   ├── brief.md              # /brief
│   ├── design.md             # /design
│   ├── tickets.md            # /tickets
│   ├── code.md               # /code
│   ├── review.md             # /review
│   └── deploy.md             # /deploy
├── agents/                    # Specialized agents
│   ├── coder.md
│   ├── product-manager.md
│   ├── code-verifier.md
│   ├── critic.md
│   ├── code-reviewer.md
│   ├── evidence-bundler.md
│   └── deployment-monitor.md
├── skills/                    # Domain knowledge
│   ├── sdlc-workflow/
│   ├── tdd-patterns/
│   └── evidence-bundles/
├── hooks/                     # Event hooks
│   ├── hooks.json
│   └── scripts/
└── README.md
```

## License

MIT
