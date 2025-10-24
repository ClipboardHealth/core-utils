# @clipboard-health/ai-rules

Pre-built AI agent rules for consistent coding standards.

## Table of contents

- [@clipboard-health/ai-rules](#clipboard-healthai-rules)
  - [Table of contents](#table-of-contents)
  - [Install](#install)
  - [Usage](#usage)
    - [Quick Start](#quick-start)
    - [Updating Rules](#updating-rules)
  - [Local development commands](#local-development-commands)

## Install

```bash
npm install --save-dev @clipboard-health/ai-rules
```

## Usage

### Quick Start

1. Choose the profile that matches your project type:

   | Profile     | Includes                    | Use For                                |
   | ----------- | --------------------------- | -------------------------------------- |
   | `common`    | common                      | TypeScript libraries, generic projects |
   | `frontend`  | common + frontend           | React apps, web apps                   |
   | `backend`   | common + backend            | NestJS services, APIs                  |
   | `fullstack` | common + frontend + backend | Monorepos, fullstack apps              |

   **Rule categories:**
   - **common**: TypeScript, testing, code style, error handling, key conventions
   - **frontend**: React patterns, hooks, performance, styling, data fetching, custom hooks
   - **backend**: NestJS APIs, three-tier architecture, controllers, services

2. Add it to your `package.json`:

   ```json
   {
     "scripts": {
       "sync-ai-rules": "node ./node_modules/@clipboard-health/ai-rules/scripts/sync.js [PROFILE_NAME]",
       "postinstall": "npm run sync-ai-rules"
     }
   }
   ```

3. Run:

   ```bash
   npm install  # Runs postinstall automatically
   ```

4. Commit the generated files:

   ```bash
   git add .
   git commit -m "feat: add AI coding rules"
   ```

5. Bonus: For repo-specific rules, create an `OVERLAY.md` file. The `sync` script appends its contents in each generated file to load the contents into AI agent context.

### Updating Rules

When we release new rules or improvements:

```bash
# Update the package
npm update @clipboard-health/ai-rules

# The postinstall script automatically copies the latest files
npm install

# Review the changes
git diff .

# Commit the updates
git add .
git commit -m "chore: update AI coding rules"
```

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
