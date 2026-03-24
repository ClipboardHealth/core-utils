---
name: work-linear-ticket
description: Use when starting work on a Linear ticket, picking up a task from Linear, or when given a ticket ID/URL to implement. Also use when a user describes work that should be tracked as a Linear ticket.
---

# Work Linear Ticket

Orchestrates the full lifecycle of implementing a Linear ticket: fetch the ticket, align on scope and test cases with the user, then autonomously implement with TDD and deliver a draft PR.

**Two phases:** Steps 1-8 are interactive — ask questions, get alignment. Steps 9-13 are autonomous — execute the plan, make judgment calls, document decisions, and deliver.

## Process

### Phase 1: Alignment (interactive — ask the user)

1. **Fetch ticket** — accept a ticket ID/URL, or search Linear and present matches for user confirmation
2. **Identify repo** — infer from ticket team/labels/description. If ambiguous, ask the user. Verify the current working directory is the correct repository (see Repo Verification below).
3. **Detect multi-repo** — if the ticket spans repos, ask the user how to proceed (one at a time or split)
4. **Create branch** — see Branch Setup below. Work in the current directory.
5. **Read AGENTS.md** — read `AGENTS.md` and all referenced rule files. Discover format, lint, typecheck, and test commands. Follow all rules throughout.
6. **Update Linear** — assign to the current user (if not already assigned). Move to "In Progress".
7. **Scope check** — before writing any code, state the planned scope to the user (see Scope Guard below) and get confirmation.
8. **Propose test cases** — derive test cases from the acceptance criteria and present them to the user for review (see Test Case Proposal below). Get confirmation before proceeding.

### Phase 2: Execution (autonomous — minimize prompting)

Once scope and test cases are approved, **execute to completion without asking the user unless truly blocked.** The goal is a draft PR with all tests passing and all acceptance criteria covered.

9. **Implement with TDD** — **REQUIRED:** Use `superpowers:test-driven-development`. No production code without a failing test first. Use the approved test cases as your starting point.
10. **Validate continuously** — after EVERY green-refactor cycle, run format, lint, and typecheck. Fix immediately. Do not batch to the end.
11. **Verify against ticket** — re-fetch the ticket. Check every acceptance criterion against code AND tests. Surface gaps, fix if needed.
12. **Final validation** — full format, lint, typecheck, and test suite pass.
13. **Hand off** — invoke `superpowers:finishing-a-development-branch`. Include a Decision Log (see below) summarizing any judgment calls made during execution.

## Repo Verification

Before creating a branch, **concretely verify** the current repo contains the files relevant to this ticket:

1. **Extract references** — pull file paths, component names, service names, endpoint paths, and test file names from the ticket description and acceptance criteria
2. **Search the current repo** — `grep` / `glob` for those references. Look for at least 2-3 matches.
3. **If matches found** — proceed with branch creation.
4. **If NO matches found** — STOP. Tell the user: "The files for this ticket don't appear to be in this repo. Please confirm which repo to work in." Do NOT attempt to switch directories or create worktrees.
5. **If ambiguous** — ask the user to confirm which repo before proceeding.

**Do NOT rely solely on the git remote URL.** The file-search is the primary verification. A matching remote URL with no matching files still means wrong repo.

## Branch Setup

Work happens in the current directory. Create a new branch based off the latest `origin/main`.

**Branch naming:** `<username>-<ticket-id>-<short-description>`

- Ticket ID lowercased (e.g., `tg-1234`)
- Short description from ticket title, kebab-cased, kept reasonable length

**Steps:**

```bash
git fetch origin
DEFAULT=$(git symbolic-ref refs/remotes/origin/HEAD | sed 's|refs/remotes/origin/||')
BRANCH="<username>-<ticket-id>-<short-desc>"
git checkout -b ${BRANCH} origin/${DEFAULT}
```

**Pre-flight:**

- Warn the user if there are uncommitted changes (staged or unstaged) before switching branches. Let the user decide how to handle them (stash, commit, discard).
- Sanity check: run typecheck to verify the environment is functional after branch creation.

## Scope Guard

Before writing any code, present the planned scope to the user for confirmation:

```text
Planned scope for <ticket-id>:
- Files to modify: <list of files>
- Type of changes: <brief description>
- Files NOT being touched: <anything the user might expect but you're intentionally skipping>
```

**Rules:**

- Default to the **smallest change** that satisfies the acceptance criteria. Do not refactor surrounding code, clean up unrelated issues, or broaden the change unless the user asks.
- If during implementation you need to modify a file **not in the agreed scope**, make the minimal change needed and log it in the Decision Log. Only stop to ask if the change is large or risky.
- If the user explicitly requests broader changes (e.g., "refactor this while you're at it"), update the scope and proceed.

## Test Case Proposal

After scope is confirmed and before writing any code, propose test cases derived from the ticket's acceptance criteria. Present them to the user for review:

```text
Proposed test cases for <ticket-id>:

<test-file-path>
- ✅ <test description mapped to acceptance criterion 1>
- ✅ <test description mapped to acceptance criterion 2>
- ✅ <test description for edge case>

<another-test-file-path> (if applicable)
- ✅ <test description>
```

**Rules:**

- Every acceptance criterion must have at least one test case. If a criterion can't be tested (e.g., "update documentation"), note it and explain why.
- Include edge cases and error scenarios, not just happy paths.
- Map each test to the acceptance criterion it covers so the user can verify coverage.
- Get user confirmation before proceeding. The user may add, remove, or modify test cases.
- These become the starting point for TDD — write the first failing test from this list, then implement to make it pass.

## Autonomous Execution (Phase 2 Guidelines)

After scope and test cases are approved, your job is to deliver a complete, passing implementation with minimal user interaction. The user has already told you what to build and how to test it — now execute.

**Prefer the smallest change that works.** When you have multiple ways to implement something, choose the one that touches fewer files, follows existing patterns, and requires the least new abstraction.

**When you hit ambiguity or a judgment call:**

1. Make your best guess using codebase context and existing patterns
2. Choose the simplest option
3. Log it in the Decision Log — what you decided, why, and what the alternative was
4. Keep going

**Only stop to ask the user when:**

- You're genuinely blocked (dependency missing, environment broken, test infrastructure unavailable)
- The ticket's requirements are contradictory and you can't resolve it from context
- The change would be significantly larger than the agreed scope (not just a small extra file)

**Do NOT stop to ask about:**

- Which pattern to follow (use existing patterns in the codebase)
- How to name things (follow existing conventions)
- Whether to add an edge case test (add it, log it)
- Minor scope extensions needed to make the implementation work (do it, log it)

## Decision Log

At handoff (step 13), present a summary of judgment calls made during autonomous execution:

```text
Decision Log for <ticket-id>:

1. <What you decided> — <Why, and what the alternative was>
2. <What you decided> — <Why>
...

Scope changes from original plan:
- Added: <file or change not in original scope, and why>
- Skipped: <anything from the plan you didn't do, and why>
```

This gives the user full visibility into your reasoning without having interrupted them during execution. They can course-correct during PR review rather than mid-implementation.

## Hard Rules

1. **NEVER skip TDD.** No production code without a failing test first. Not even for "one-liners."
2. **NEVER batch validation.** Format, lint, and typecheck after EVERY green-refactor cycle. Not once at the end.
3. **AGENTS.md rules are non-negotiable.** Read them before writing any code. Follow all of them.
4. **NEVER auto-commit, auto-push, or auto-create PRs.** Hand off to the finishing workflow.
5. **NEVER guess the repo.** If confidence is low, ask the user.
6. **Verify against the ticket before handoff.** Every acceptance criterion must be covered by code AND tests.
7. **Branch naming is exact:** `<username>-<ticket-id>-<short-description>`. Derive username from git config or ask.
8. **Always update Linear.** Assign to self and move to "In Progress" before implementation begins.
9. **Verify the current directory is the correct repo** before creating a branch. If not, ask the user to switch.
10. **Prefer the smallest change** that satisfies the acceptance criteria. If you need to go slightly beyond scope, do it and log it. Only ask if the change is large or risky.
11. **Search for actual files** during repo verification, not just the git remote URL.

## Red Flags — STOP If You Notice These

| You're about to...                                       | STOP and...                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------- |
| Write implementation code                                | Write a failing test first                                          |
| Run lint/typecheck "at the end"                          | Run it NOW, after this cycle                                        |
| Commit and push without asking the user                  | Invoke `superpowers:finishing-a-development-branch`                 |
| Start coding without reading AGENTS.md                   | Read AGENTS.md and all referenced rules first                       |
| Name a branch without `<username>-` prefix               | Fix the branch name                                                 |
| Skip the Linear status update                            | Update it before implementing                                       |
| Say "the fix is done" without re-reading the ticket      | Re-fetch and verify every acceptance criterion                      |
| Run format/lint/typecheck only once at the end           | You should have been running them all along                         |
| Create a branch without checking for uncommitted changes | Warn the user about uncommitted changes first                       |
| Start work in the wrong repo                             | Verify the repo matches the ticket first                            |
| Modify files not in the agreed scope                     | Make the minimal change needed and log it — only ask if large/risky |
| Refactor surrounding code while fixing a bug             | Only fix the bug unless user asked for more                         |
| Ask the user a question during Phase 2                   | Make your best guess, log it, keep going — unless truly blocked     |
| Verify repo by remote URL alone                          | Search for actual ticket-referenced files                           |

## Error Handling

- **Branch already exists:** Ask the user whether to check out the existing branch or create a new one with a suffix.
- **Uncommitted changes:** Warn the user and let them decide (stash, commit, or discard) before switching branches.
- **Sanity check fails:** Surface the error. Do not proceed until the environment is functional.
- **No AGENTS.md:** Warn the user. Proceed with default conventions.
- **Linear unreachable:** Warn and proceed with available context. Don't block implementation.
- **TDD gets stuck:** Surface the blocker to the user rather than abandoning TDD.
- **Wrong repo:** Tell the user which repo is needed.

## Cross-Referenced Skills

- **REQUIRED:** `superpowers:test-driven-development` — TDD methodology
- **REQUIRED:** `superpowers:finishing-a-development-branch` — completion handoff
