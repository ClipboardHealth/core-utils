# @clipboard-health/ai-rules

Pre-built AI agent rules for consistent coding standards across your projects. Dead simple installation with just a copy command.

## Table of contents

- [Install](#install)
- [Usage](#usage)
  - [Quick Start](#quick-start)
  - [Available Profiles](#available-profiles)
  - [What Gets Copied](#what-gets-copied)
- [How It Works](#how-it-works)
- [Update Rules](#update-rules)
- [Local Development](#local-development)

## Install

```bash
npm install --save-dev @clipboard-health/ai-rules
```

## Usage

### Quick Start

Choose the profile that matches your project type and add this to your `package.json`:

**Frontend project (React):**

```json
{
  "scripts": {
    "sync-ai-rules": "cp -r ./node_modules/@clipboard-health/ai-rules/dist/frontend/. ./",
    "postinstall": "npm run sync-ai-rules"
  }
}
```

**Backend project (NestJS):**

```json
{
  "scripts": {
    "sync-ai-rules": "cp -r ./node_modules/@clipboard-health/ai-rules/dist/backend/. ./",
    "postinstall": "npm run sync-ai-rules"
  }
}
```

**Fullstack project:**

```json
{
  "scripts": {
    "sync-ai-rules": "cp -r ./node_modules/@clipboard-health/ai-rules/dist/fullstack/. ./",
    "postinstall": "npm run sync-ai-rules"
  }
}
```

**TypeScript library (common rules only):**

```json
{
  "scripts": {
    "sync-ai-rules": "cp -r ./node_modules/@clipboard-health/ai-rules/dist/common/. ./",
    "postinstall": "npm run sync-ai-rules"
  }
}
```

Then run:

```bash
npm install  # Runs postinstall automatically
```

**Commit the generated files:**

```bash
git add AGENTS.md CLAUDE.md .cursor/
git commit -m "feat: add AI coding rules"
```

### Available Profiles

| Profile     | Includes                    | Use For                                |
| ----------- | --------------------------- | -------------------------------------- |
| `frontend`  | common + frontend           | React apps, web apps                   |
| `backend`   | common + backend            | NestJS services, APIs                  |
| `fullstack` | common + frontend + backend | Monorepos, fullstack apps              |
| `common`    | common only                 | TypeScript libraries, generic projects |

**Rule categories:**

- **common**: TypeScript, testing, code style, error handling, key conventions
- **frontend**: React patterns, hooks, performance, styling, data fetching, custom hooks
- **backend**: NestJS APIs, three-tier architecture, controllers, services

### What Gets Copied

Each profile copies these files to your project root:

```text
AGENTS.md         # GitHub Copilot, OpenAI Codex
CLAUDE.md         # Claude Code
.cursor/          # Cursor AI
```

Your AI assistants will automatically use these files.

## How It Works

1. **Install** the package as a dev dependency
2. **Add `sync-ai-rules` script** to copy the profile you need
3. **Add to `postinstall`** so it runs automatically on `npm install`
4. **Commit the files** to your repo (they're generated, but should be committed)
5. **Update anytime** - When you update the package version, `postinstall` re-syncs the latest rules

## Update Rules

When we release new rules or improvements:

```bash
# Update the package
npm update @clipboard-health/ai-rules

# The postinstall script automatically copies the latest files
# Review the changes
git diff AGENTS.md CLAUDE.md .cursor/

# Commit the updates
git add AGENTS.md CLAUDE.md .cursor/
git commit -m "chore: update AI coding rules"
```

## Local Development

This package is part of the `core-utils` monorepo.

**Build all profiles:**

```bash
npm run build
```

This generates pre-built files in `dist/` for each profile:

```text
dist/
  ├── frontend/    (AGENTS.md, CLAUDE.md, .cursor/)
  ├── backend/     (AGENTS.md, CLAUDE.md, .cursor/)
  ├── fullstack/   (AGENTS.md, CLAUDE.md, .cursor/)
  └── common/      (AGENTS.md, CLAUDE.md, .cursor/)
```

**Format markdown:**

```bash
npm run format
```

**Lint markdown:**

```bash
npm run lint:md
```

**Apply Ruler locally (for testing):**

```bash
npm run apply
```

See [`package.json`](./package.json) `scripts` for a complete list of commands.

---
