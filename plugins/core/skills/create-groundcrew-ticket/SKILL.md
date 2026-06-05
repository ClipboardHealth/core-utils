---
name: create-groundcrew-ticket
description: "Create Linear tickets that Groundcrew can pick up: assigned to the current Linear user, labeled with agent-*, tied to an implementation repository in the description, optionally linked to parent and blocker tickets, and written to use the core:go implementation workflow."
---

# Create Groundcrew Ticket

Create Linear issues that are ready for Groundcrew dispatch. This skill is agent-agnostic: use the structured Linear capability available in the current agent, following that tool's current schema instead of hard-coding one here.

## Eligibility Contract

A Linear issue is Groundcrew-eligible when all of these are true:

- It is assigned to the current Linear user. Use the active Linear tool's "current user" value, commonly `me`, when available.
- It is in a Todo workflow state. Prefer the Linear state type for Todo when tooling accepts state types.
- It has exactly one appropriate `agent-*` label. Use `agent-any` unless the user explicitly asks for a specific model such as `agent-codex` or `agent-claude`.
- Its description contains the implementation repository text exactly as Groundcrew can match it, for example `Repository: groundcrew`.
- It is a leaf work item. Do not put `agent-*` labels on parent tickets that have children; Groundcrew skips parents with sub-issues.
- It is not blocked by non-terminal blockers if the user expects it to start immediately. If blockers are intentional, create `blocked-by` relations and tell the user Groundcrew will wait.

Groundcrew resolves the repository by scanning the description for a known repository name. Do not rely on Linear custom fields for repository routing.

## Required Inputs

Before creating, know:

- `title`
- Linear `team`
- implementation `repository`
- enough task context to write a useful implementation ticket

If any required input is missing and cannot be inferred safely, ask a concise question before creating.

Repository inference:

- If the user names a repository, use that exact value.
- Otherwise infer from the current git remote or directory name.
- Prefer a value present in `crew.config.ts` `workspace.knownRepositories` when this repo is available.
- If multiple known repositories could match the same bare name, ask the user to choose.

Optional metadata:

- `parent`: parent Linear identifier, for example `ENG-123`
- blocked-by relations: tickets this new ticket depends on
- blocking relations: tickets this new ticket blocks

## Description Template

Use a direct implementation-shaped ticket. Keep the repository line near the top.

```md
## Groundcrew

Repository: <repo>
Implementation workflow: use the `core:go` skill when available. If the current host exposes the same skill without plugin namespaces, use that equivalent. If that skill is unavailable, follow this repo's AGENTS.md/CLAUDE.md implementation workflow and run the documented verification.

## Task

<what to change>

## Acceptance Criteria

- [ ] <observable outcome>

## Notes

<links, constraints, parent/blocker context, or "None">
```

Keep the ticket agent-agnostic. Do not mention Codex-only commands unless the user explicitly requested a Codex-specific ticket.

## Creation Path

Use the current agent's structured Linear issue tool. Tool names and exact field names vary, so inspect the active tool schema/help and map these intents to the available fields:

- Set the `title`.
- Assign it to the current Linear user.
- Set its state to Todo.
- Apply the chosen `agent-*` label.
- Put the generated Markdown body in the issue description.
- Set the parent issue when the user provided one.
- Add dependency relations for blockers and blocked tickets.
- Apply optional project, cycle, milestone, priority, estimate, and due date metadata only when requested or clearly inferable.

Rules:

- Use a blocked-by relation for "this work is blocked by X".
- Use a blocking relation only when the user says the new ticket blocks another ticket.
- If the tool cannot create relations during creation, create the issue first, then update it to add the parent and dependency relations.
- If creating a parent and child tickets, create the parent without an `agent-*` label, then create labeled child tickets under that parent.

## Verification

After creation:

- Confirm the resulting issue identifier and URL.
- Check that the issue has the intended assignee, state, `agent-*` label, repository line, parent, and relations.
- If this Groundcrew repo or `crew` CLI is available, run `node --run crew -- status <ISSUE>` and report whether Groundcrew sees the ticket as ready for dispatch or why it will wait.

Do not claim the ticket is eligible if verification fails. Report the missing field or blocking condition plainly.
