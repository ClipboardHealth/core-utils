# @clipboard-health/ai-rules <!-- omit from toc -->

Modular AI agent rules for consistent coding standards across your projects. One command to configure Claude, Cursor, GitHub Copilot, and more.

**✨ Features:**

- 🤖 Auto-detects your project type (React, NestJS, fullstack)
- 💬 Interactive setup with smart defaults
- 📦 Automatically updates `package.json` and `.gitignore`
- 🎯 Generates config files for multiple AI assistants
- 🔄 Keep rules in sync across all your projects

## Table of contents <!-- omit from toc -->

- [Install](#install)
- [Usage](#usage)
  - [Quick Start (Interactive Setup)](#quick-start-interactive-setup)
  - [Quick Start (Direct Apply)](#quick-start-direct-apply)
  - [View Available Profiles](#view-available-profiles)
  - [What Gets Generated](#what-gets-generated)
  - [Available Rule Categories](#available-rule-categories)
  - [Examples](#examples)
- [How It Works](#how-it-works)
- [Local development commands](#local-development-commands)

## Install

```bash
npm install --save-dev @clipboard-health/ai-rules
```

## Usage

### Quick Start (Interactive Setup)

The easiest way to get started is with the interactive `init` command:

```bash
npm install --save-dev @clipboard-health/ai-rules
npx @clipboard-health/ai-rules init
```

This will:

- 🔍 **Auto-detect** your project type (frontend, backend, fullstack)
- 💬 **Prompt** you to select the right profile
- 📦 **Ask** if you want to update `package.json` with a sync script
- 📝 **Ask** if you want to update `.gitignore` with generated files
- ✨ **Generate** AI agent config files

#### Non-interactive Mode

Skip all prompts by specifying a profile directly:

```bash
npx @clipboard-health/ai-rules init --profile=frontend
```

This will only generate the AI agent files without updating `package.json` or `.gitignore`.

### Quick Start (Direct Apply)

If you prefer direct control without interactive prompts:

```bash
# Frontend project (React)
npx @clipboard-health/ai-rules apply --profile=frontend

# Backend project (NestJS)
npx @clipboard-health/ai-rules apply --profile=backend

# Fullstack project
npx @clipboard-health/ai-rules apply --profile=fullstack

# TypeScript library (just common rules)
npx @clipboard-health/ai-rules apply --profile=common

# Custom combination using rulesets
npx @clipboard-health/ai-rules apply --ruleset=common,frontend

# Preview changes without writing files
npx @clipboard-health/ai-rules apply --profile=frontend --dry-run
```

### View Available Profiles

See what profiles and rulesets are available:

```bash
npx @clipboard-health/ai-rules list
```

### What Gets Generated

The CLI generates config files for the primary AI coding assistants:

- ✅ `AGENTS.md` (GitHub Copilot, OpenAI Codex, and other AGENTS.md-compatible assistants)
- ✅ `CLAUDE.md` (Claude Code)
- ✅ `.cursor/rules/` (Cursor AI)

**No manual setup required!** The package handles everything.

### Available Rule Categories

| Category        | Description                       | Files                                                          |
| --------------- | --------------------------------- | -------------------------------------------------------------- |
| **`common/`**   | Core conventions for all projects | Code style, error handling, TypeScript usage, testing patterns |
| **`frontend/`** | Frontend development rules        | React patterns, UI/styling                                     |
| **`backend/`**  | Backend development rules         | NestJS APIs, three-tier architecture                           |

### Examples

#### Interactive Setup (Recommended)

```bash
# Install and run interactive setup
npm install --save-dev @clipboard-health/ai-rules
npx @clipboard-health/ai-rules init

# The CLI will:
# 1. Detect your project type
# 2. Prompt you to confirm or change the profile
# 3. Ask if you want to add a sync script
# 4. Ask if you want to update .gitignore
# 5. Generate all AI agent config files
```

#### Frontend React Project

```bash
npm install --save-dev @clipboard-health/ai-rules
# Interactive (recommended):
npx @clipboard-health/ai-rules init
# Or non-interactive:
npx @clipboard-health/ai-rules init --profile=frontend
# Or just apply rules:
npx @clipboard-health/ai-rules apply --profile=frontend
```

#### Backend NestJS Project

```bash
npm install --save-dev @clipboard-health/ai-rules
# Interactive (recommended):
npx @clipboard-health/ai-rules init
# Or non-interactive:
npx @clipboard-health/ai-rules init --profile=backend
```

#### Fullstack Project

```bash
npm install --save-dev @clipboard-health/ai-rules
# Interactive (recommended):
npx @clipboard-health/ai-rules init
# Or non-interactive:
npx @clipboard-health/ai-rules init --profile=fullstack
```

#### TypeScript Library

```bash
npm install --save-dev @clipboard-health/ai-rules
npx @clipboard-health/ai-rules apply --profile=common
```

#### Custom Ruleset Combination

```bash
npx @clipboard-health/ai-rules apply --ruleset=common,frontend,backend
```

#### Preview Changes (Dry Run)

```bash
# See what files would be generated without actually creating them
npx @clipboard-health/ai-rules apply --profile=frontend --dry-run
```

#### Automatic Sync on Install

The `init` command can automatically set this up, or you can add it manually:

```json
{
  "scripts": {
    "sync-ai-rules": "npx @clipboard-health/ai-rules apply --profile=frontend",
    "postinstall": "npm run sync-ai-rules"
  }
}
```

## How It Works

1. **This package** provides organized markdown rule files in category folders (common, frontend, backend)
2. **The CLI** intelligently detects your project type and selects appropriate rules
3. **Ruler** (abstracted by the CLI) generates configuration files for multiple AI assistants
4. **Your project** gets perfectly configured AI agent files with zero manual effort

### Commands

- **`init`** - Interactive setup with project detection, prompts, and automatic configuration
- **`apply`** - Direct rule application with profiles or custom ruleset combinations
- **`list`** - View all available profiles and rulesets
- **`--dry-run`** - Preview what files would be generated without actually creating them

### Benefits

- ✅ **Intelligent defaults** - Auto-detects project type (React, NestJS, etc.)
- ✅ **Interactive or direct** - Use prompts or specify `--profile` for non-interactive mode
- ✅ **Selective rules** - Only include what you need via profiles or rulesets
- ✅ **Zero complexity** - Single command handles everything
- ✅ **Multi-agent support** - Works with Claude, Cursor, GitHub Copilot, and more
- ✅ **Automatic updates** - Update the package and re-sync to get latest rules
- ✅ **No Ruler knowledge needed** - CLI abstracts all complexity

## Local development commands

```bash
# Format all rule files
npm run format

# Apply ruler (for this package's own development)
npm run apply
```

See [`package.json`](./package.json) `scripts` for a complete list of commands.
