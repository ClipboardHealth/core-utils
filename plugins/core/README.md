# Core Plugin <!-- omit from toc -->

Clipboard's core development tools.

## Table of contents <!-- omit from toc -->

- [Installation](#installation)
- [Prerequisites](#prerequisites)
- [Workflow skills](#workflow-skills)
  - [cb-work](#cb-work)
  - [cb-ship](#cb-ship)
  - [cb-babysit](#cb-babysit)
  - [cb-review](#cb-review)
- [Skills](#skills)
  - [adversarial-review](#adversarial-review)
  - [clipboard-design-engineering](#clipboard-design-engineering)
  - [cognito-user-analysis](#cognito-user-analysis)
  - [create-groundcrew-ticket](#create-groundcrew-ticket)
  - [datadog-investigate](#datadog-investigate)
  - [flaky-debug](#flaky-debug)
  - [frontend-ui-verification](#frontend-ui-verification)
  - [humanize-prose](#humanize-prose)
  - [local-package](#local-package)
  - [seed-data](#seed-data)
  - [update-tempo-alerts](#update-tempo-alerts)

## Installation

```bash
# Add the marketplace
/plugin marketplace add ClipboardHealth/core-utils

# Install the plugin
/plugin install core@clipboard --scope user
```

## Prerequisites

- [GitHub CLI](https://cli.github.com/) (`gh`) — used by CI check and PR skills

## Workflow skills

### cb-work

Implement a plan file or direct request end-to-end, validate, and ship via cb-ship.

### cb-ship

Ship changes: simplify the diff, commit, push, and open or update a PR.

### cb-babysit

Watch a PR through CI and review feedback: auto-fix high-confidence failures and address review comments.

### cb-review

Review a diff, branch, or PR against a single rubric: single-pass by default, parallel reviewer agents with a debate round at high effort, plus a spec-compliance lens when the originating ticket or PRD is available. Invoke with `/cb-review [pr-number-or-url] [--effort low|high]`.

## Skills

### adversarial-review

Perform an adversarial review of proposed work.

### clipboard-design-engineering

Apply Clipboard's design engineering standards for UI polish, component feel, interaction details, and motion decisions. Use for frontend polish, animation review, visual hierarchy, and component craft in admin or mobile UI.

### cognito-user-analysis

Analyze and fix duplicate Cognito users by comparing against backend data. Useful for diagnosing 403 Forbidden errors, duplicate accounts sharing phone/email, and orphaned UNCONFIRMED signups. Invoke with `/cognito-user-analysis`.

### create-groundcrew-ticket

Create Linear tickets that Groundcrew can pick up.

### datadog-investigate

Investigate production issues by querying Datadog logs, metrics, and APM traces, then correlating findings with the codebase. Invoke with `/datadog-investigate` or by mentioning production errors, latency spikes, error rates, or trace IDs.

### flaky-debug

Debug and fix flaky Playwright E2E tests using Playwright reports and Datadog.

### frontend-ui-verification

Verify Clipboard frontend UI work against code, design references, Storybook, and browser screenshots. Use for Figma/design implementation, redesign UI changes, Storybook checkpoints, and visual QA.

### humanize-prose

Strip AI writing tells (hedging, throat-clearing, marketing adjectives, bullet bloat, connective filler, em-dashes) from prose you draft or clean: PR descriptions, Slack messages, docs, emails, and commit messages. Edits in place while preserving meaning. Invoke with `/humanize-prose` or let Claude auto-trigger when drafting text for you. For cleaning up code (defensive guards, type escapes, unnecessary comments), use `cb-ship`'s simplify pass before opening a PR.

### local-package

Use Clipboard's internal CLI (`@clipboard-health/cli`) to link and unlink packages across repositories for local development. Invoke with `/local-package` or let Claude auto-trigger when discussing local package development.

See [`skills/local-package/SKILL.md`](skills/local-package/SKILL.md) for usage details.

### seed-data

Trigger the `Generate Seed Data` GitHub Actions workflow to create test data (HCPs, facilities, shifts) in development, staging, or prod-shadow environments. Invoke with `/seed-data` or by asking to seed/create test data.

### update-tempo-alerts

Incrementally update the "🚨 Tempo alerts" Notion doc from the `#team-tempo-alerts` Slack channel: reads Datadog + Hex alerts posted since the current week's `Last updated` cursor, increments Warn/Error counts for repeat alerts (no duplicate rows), adds new alerts with why-it-fired / what-we-did notes, and advances the cursor. Meant to run daily. Invoke with `/update-tempo-alerts`.
