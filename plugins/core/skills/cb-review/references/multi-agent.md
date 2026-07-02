# High-effort engine — parallel reviewers, one debate round, moderator filter

Read this only when effort is `high`. Referenced from `SKILL.md`. The rubric in `review-rubric.md` is binding for every agent.

## Roster

One reviewer agent per active lens. **Refer to agents by name in everything the user sees**; the letter is only a compact prefix for internal finding IDs (`B1`, `C3`, …).

| Letter | Name        | Rubric section | When it runs           |
| ------ | ----------- | -------------- | ---------------------- |
| B      | Engineering | §Engineering   | Always                 |
| C      | Minimalist  | §Minimalism    | Always                 |
| D      | Conventions | §Conventions   | Always                 |
| E      | Security    | §Security      | Classification trigger |
| F      | Database    | §Database      | Classification trigger |
| G      | Frontend    | §Frontend      | Classification trigger |
| H      | AntiSlop    | §AntiSlop      | Always                 |
| S      | Spec        | §Spec          | Spec source found      |

Record the dispatched set in `/tmp/cb-review-meta.json` so Round 2 knows the full agent list.

## Dispatch mechanics

Use the host's parallel subagent mechanism (in Claude Code: the `Agent` tool with `subagent_type: general-purpose`, all calls in a single message so they run truly in parallel). Use fresh agents for every round. If one agent fails or returns malformed output, re-dispatch **that agent only** — do not restart the round. If the host cannot run subagents, run each role as a sequential pass in the main context, writing each role's findings to `/tmp/cb-review-round1-<name>.md` before starting the next so later passes can't contaminate earlier ones.

Keep large content on disk (`/tmp/cb-review-*`) so Round 2 prompts stay compact.

Every agent prompt includes:

- The file paths from Scope (`/tmp/cb-review-diff.patch`, `-context.md`, `-files.txt`).
- An instruction to read `review-rubric.md` **§Admission** plus the agent's own lens section (give the absolute path to this skill's `references/review-rubric.md`), and — for Spec — the spec source content or how to fetch it.
- The two contracts below, verbatim (substitute `<context_ref>` from the freshness preflight):

> **Context-read contract.** The verified-fresh ref for repo context is `<context_ref>`. For any file that is part of the primary repo's tracked content (i.e. _not_ a brand-new file in this PR's diff), use `git show "<context_ref>:<path>"` or `git grep -n <pattern> "<context_ref>" -- <paths>` rather than reading the worktree. If you read from the worktree because the file is new in the diff or untracked at `<context_ref>`, say so in the finding's `point`.
>
> **Cross-repo evidence contract.** If a finding's load-bearing evidence is in any repo other than this one, do NOT silently read another local checkout — those checkouts may be stale or on unrelated branches. Instead, emit the finding with an `evidence_required` field naming the repo(s) and the specific verification question, and cap your severity at MAJOR. The moderator will ask the user for verified access before Round 2 and re-dispatch you if needed.

## Round 1 — parallel independent reviews

Agents must not see each other's output in this round. Each agent emits at most 8 findings, prioritized — not exhaustive.

Required output per finding: `id` (letter-prefixed: `B1`, `C3`, `S1`, …), `severity`, `file:lines`, `title` (one sentence), `point` (one short paragraph), `failure_mode` (one sentence), optional `suggested_fix` (schema in rubric §Admission), and optional `evidence_required` (`{ repos: string[], what_to_verify: string }` — required whenever the finding depends on cross-repo state).

After Round 1, collect every `evidence_required` block and resolve it with the user per `cross-repo-evidence.md` **before** Round 2.

## Round 2 — debate (last round; hard cap: 2)

Dispatch the same agent set, in parallel. Each agent receives **all Round 1 outputs** and must:

- Re-examine their own findings and **withdraw** any that don't survive scrutiny.
- For each other agent's finding: mark `agree`, `disagree` (with reasoning), or `refine` (propose a tighter version).
- Flag items where disagreement is substantive and unlikely to resolve.

Output per item: `id`, `original_author` (agent **name**, not letter), `verdict` (keep | withdraw | agree | disagree | refine), `final_severity`, `final_title`, `final_failure_mode`, `reasoning`, `suggested_fix`, and rebuttals `[{from, stance, reasoning}]` (`from` is also a name).

**AntiSlop plays an expanded Round 2 role**: beyond defending or withdrawing its own findings, it audits every other agent's finding for the slop patterns it scans code for, and marks matches `disagree` with a one-line `slop:` label in `reasoning`:

- "Add a null check / try-catch / validation" on a value already typed, validated upstream, or guaranteed by a preceding call → `slop: asks for defensive guard on already-narrowed value`.
- "What if a future caller / someone later…" with no current realistic input → `slop: hypothetical future caller — no current path`.
- Comment/JSDoc requests where name + signature already convey intent → `slop: restating-the-obvious comment request`.
- Refactor suggestions whose failure_mode is shape-of-the-code → `slop: refactor with no concrete cost-of-keeping`.
- "Add a log/metric" without the specific failure it would debug → `slop: observability without named failure mode`.
- Test demands on type-evident or already-exercised code → `slop: test for trivially-verifiable code`.
- Worries about states the product cannot produce → `slop: defends against a state the product cannot produce`.

When an agent sees a slop tag on its own finding, it either rebuts with a concrete, product-specific `final_failure_mode` or withdraws — not both stand on the original framing. Even when AntiSlop's own Round 1 findings are sparse because the diff is clean, it must not under-spend on this audit — stopping slop _suggestions_ from polluting the review is often the bigger lever.

Residual disagreement goes to the Disagreements section of the synthesis.

## Moderator filter (main agent — after Round 2, before synthesis)

Apply the shared Filter list from `SKILL.md`, with these additions in order:

1. **Apply AntiSlop slop tags.** For every finding AntiSlop tagged `slop:`, check the original author's Round 2 rebuttal. No concrete, product-specific `final_failure_mode` addressing the specific tag → **drop the finding**. AntiSlop's audit is not a unilateral veto, but the burden of proof shifts to the author once tagged. Record drops in Withdrawn with the slop label (e.g. `B4 — dropped: AntiSlop tagged "slop: asks for defensive guard on already-narrowed value", Engineering did not rebut`).
2. **Merge near-duplicates across agents** into one item, preserving all attributions in `Raised by:`.
3. Renumber the survivors 1..N for the user-facing Actionable list and gates; keep agent names in `Raised by` / `agreed by`.
