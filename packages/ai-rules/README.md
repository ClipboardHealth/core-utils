# @clipboard-health/ai-rules

Pre-built AI agent rules for consistent coding standards. Uses a retrieval-based approach: generates a compressed index in `AGENTS.md` pointing to individual rule files that agents read on demand.

## Table of contents

- [Install](#install)
- [Usage](#usage)
  - [Quick Start](#quick-start)
  - [Include/Exclude Rules](#includeexclude-rules)
  - [Updating Rules](#updating-rules)
- [Available Rules](#available-rules)
- [Migration from v1](#migration-from-v1)
- [Local development commands](#local-development-commands)

## Install

```bash
npm install --save-dev @clipboard-health/ai-rules
```

## Usage

### Quick Start

1. If you have an existing `AGENTS.md` and/or `CLAUDE.md` file in your repository, rename it to `OVERLAY.md`. The sync script appends this file's contents to generated `AGENTS.md` so it's loaded into LLM agent contexts.

2. Choose the profile that matches your project type:

   | Profile        | Includes                    | Use For                                |
   | -------------- | --------------------------- | -------------------------------------- |
   | `common`       | common                      | TypeScript libraries, generic projects |
   | `frontend`     | common + frontend           | React apps, web apps                   |
   | `backend`      | common + backend            | NestJS services, APIs                  |
   | `fullstack`    | common + frontend + backend | Monorepos, fullstack apps              |
   | `datamodeling` | datamodeling                | DBT data modeling                      |

3. Add it to your `package.json`:

   ```json
   {
     "scripts": {
       "sync-ai-rules": "node ./node_modules/@clipboard-health/ai-rules/scripts/sync.js [PROFILE_NAME]",
       "postinstall": "npm run sync-ai-rules"
     }
   }
   ```

4. Run:

   ```bash
   npm install  # Runs postinstall automatically
   ```

5. Commit the generated files:

   ```bash
   git add .rules/ AGENTS.md CLAUDE.md
   git commit -m "feat: add AI coding rules"
   ```

### Include/Exclude Rules

Fine-tune which rules are synced using `--include` and `--exclude`:

```bash
# Backend profile without MongoDB rules
node sync.js backend --exclude backend/mongodb

# Common profile plus one backend rule
node sync.js common --include backend/architecture

# Multiple overrides
node sync.js backend --exclude backend/mongodb backend/postgres --include frontend/testing
```

Update your `package.json` script accordingly:

```json
{
  "scripts": {
    "sync-ai-rules": "node ./node_modules/@clipboard-health/ai-rules/scripts/sync.js backend --exclude backend/mongodb"
  }
}
```

### Updating Rules

When we release new rules or improvements:

```bash
# Update the package
npm update @clipboard-health/ai-rules

# The postinstall script automatically syncs the latest files
npm install

# Review the changes
git diff .rules/ AGENTS.md

# Commit the updates
git add .rules/ AGENTS.md CLAUDE.md
git commit -m "chore: update AI coding rules"
```

## Available Rules

### common

| Rule ID                       | Description                                                    |
| ----------------------------- | -------------------------------------------------------------- |
| `common/configuration`        | Config decisions: secrets, SSM, feature flags, DB vs hardcoded |
| `common/coreLibraries`        | Available `@clipboard-health/*` shared libraries               |
| `common/featureFlags`         | Feature flag naming, lifecycle, and cleanup                    |
| `common/gitWorkflow`          | Commit messages, PR titles, and pull request guidelines        |
| `common/loggingObservability` | Log levels, structured context, PII avoidance                  |
| `common/testing`              | Unit test conventions and structure                            |
| `common/typeScript`           | TypeScript naming, types, functions, error handling            |

### backend

| Rule ID                  | Description                                         |
| ------------------------ | --------------------------------------------------- |
| `backend/architecture`   | Three-tier pattern: modules, services, controllers  |
| `backend/asyncMessaging` | Queues, async messaging, background jobs            |
| `backend/mongodb`        | MongoDB/Mongoose: schemas, indexes, queries         |
| `backend/notifications`  | Notification and messaging patterns                 |
| `backend/postgres`       | Postgres queries: Prisma, subqueries, feature flags |
| `backend/restApiDesign`  | REST API design: JSON:API, endpoints, contracts     |
| `backend/serviceTests`   | Service-level integration tests                     |

### frontend

| Rule ID                            | Description                                  |
| ---------------------------------- | -------------------------------------------- |
| `frontend/customHooks`             | React custom hooks patterns                  |
| `frontend/dataFetching`            | React Query, API calls, caching              |
| `frontend/e2eTesting`              | E2E testing with Playwright                  |
| `frontend/errorHandling`           | React error handling patterns                |
| `frontend/fileOrganization`        | Frontend file and folder organization        |
| `frontend/frontendTechnologyStack` | Frontend library and framework choices       |
| `frontend/interactiveElements`     | Forms, buttons, inputs                       |
| `frontend/modalRoutes`             | Modals and route-based dialogs               |
| `frontend/reactComponents`         | React component patterns, props, composition |
| `frontend/styling`                 | CSS, themes, responsive design               |
| `frontend/testing`                 | React Testing Library, component tests       |

### datamodeling

| Rule ID                                | Description                             |
| -------------------------------------- | --------------------------------------- |
| `datamodeling/analytics`               | Analytics data models                   |
| `datamodeling/castingDbtStagingModels` | Data type casting in dbt staging models |
| `datamodeling/dbtModelDevelopment`     | dbt model naming, structure, testing    |
| `datamodeling/dbtYamlDocumentation`    | dbt YAML documentation and schema files |

## Migration from v1

v2 replaces the monolithic `AGENTS.md` with a retrieval-based approach. Rule files are now committed to your repo under `.rules/`.

1. Update the package:

   ```bash
   npm install --save-dev @clipboard-health/ai-rules@latest
   ```

2. Run install to trigger sync:

   ```bash
   npm install
   ```

3. Add `.rules/` to git and commit:

   ```bash
   git add .rules/ AGENTS.md CLAUDE.md
   git commit -m "feat!: update ai-rules to v2 retrieval-based approach"
   ```

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
