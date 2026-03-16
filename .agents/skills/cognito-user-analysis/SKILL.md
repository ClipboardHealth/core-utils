---
name: cognito-user-analysis
description: Use when looking up Cognito user details by sub UUID, finding duplicate accounts sharing phone or email, analyzing which duplicates to keep vs delete, or fixing orphaned UNCONFIRMED signups. Symptoms include 403 Forbidden on login, multiple accounts for same phone, backend sync issues.
---

# Cognito User Analysis

Analyze and fix duplicate Cognito users in clipboard-production by comparing against backend data.

**Skill directory:** This skill's scripts are in `scripts/` relative to this file.

## When to Use

- User reports "403 Forbidden" or can't log in (possible duplicate blocking)
- Need to look up Cognito user details from sub UUIDs
- Finding accounts sharing same phone/email
- Cleaning up orphaned UNCONFIRMED signups
- Backend `cbh_user_id` doesn't match Cognito

**Not for:** Single user attribute updates (use AWS CLI directly)

## Quick Start

```bash
# Set SKILL_DIR to wherever this skill is installed
SKILL_DIR="<path-to-this-skill>"

# 1. Verify prerequisites
$SKILL_DIR/scripts/check-prerequisites.sh

# 2. Create input file (one sub per line)
echo "68e1e380-d0c1-7028-4256-3361fd833080" > subs.txt

# 3. Pipeline: lookup → find duplicates → analyze → fix
$SKILL_DIR/scripts/cognito-lookup.sh subs.txt results.csv
$SKILL_DIR/scripts/cognito-find-duplicates.sh results.csv duplicates.csv
$SKILL_DIR/scripts/cognito-analyze-duplicates.sh duplicates.csv analysis.csv

# 4. Review analysis.csv, then fix (ALWAYS dry-run first!)
$SKILL_DIR/scripts/cognito-fix-duplicates.sh analysis.csv --dry-run
$SKILL_DIR/scripts/cognito-fix-duplicates.sh analysis.csv
```

## Prerequisites

Run `scripts/check-prerequisites.sh` to verify. Requirements:

| Requirement                           | Setup                                                       |
| ------------------------------------- | ----------------------------------------------------------- |
| AWS profile `cbh-production-platform` | `aws sso login --profile cbh-production-platform`           |
| `~/.cbh_token`                        | Get from web app dev tools → Network → Authorization header |

See [docs/setup.md](docs/setup.md) for detailed setup.

## Scripts

All scripts support `--help`. Run `<script> --help` for full usage.

| Script                                  | Purpose                                     |
| --------------------------------------- | ------------------------------------------- |
| `scripts/check-prerequisites.sh`        | Verify AWS + API token are valid            |
| `scripts/cognito-lookup.sh`             | sub → user details CSV                      |
| `scripts/cognito-find-duplicates.sh`    | Find accounts sharing phone/email           |
| `scripts/cognito-analyze-duplicates.sh` | Compare against backend, assign KEEP/DELETE |
| `scripts/cognito-fix-duplicates.sh`     | Execute deletions and updates               |

## Scoring (Analysis)

Compares Cognito accounts against backend to determine which to keep:

| Score | Meaning                                                |
| ----- | ------------------------------------------------------ |
| 185   | Perfect match: cbh_user_id + email + phone + CONFIRMED |
| 100+  | cbh_user_id matches (high confidence)                  |
| 25-99 | Partial match (email or phone only)                    |
| 0-24  | Orphaned signup (UNCONFIRMED, no backend link)         |

Highest score = `KEEP_AND_UPDATE`. Others = `DELETE`.

## Common Mistakes

| Mistake                | Fix                                            |
| ---------------------- | ---------------------------------------------- |
| 403 Forbidden from API | Token expired → get fresh token from web app   |
| Skipping --dry-run     | Always dry-run first. Deletes are permanent.   |
| Wrong AWS profile      | Run `scripts/check-prerequisites.sh` to verify |

## Detailed Docs

- [docs/setup.md](docs/setup.md) - Prerequisites setup guide
- [docs/analysis-workflow.md](docs/analysis-workflow.md) - Pipeline details
- [docs/fix-workflow.md](docs/fix-workflow.md) - Fix execution details
