---
name: blind-backtest
description: Backtest an automated judgment stage (clustering, verdicts, routing, gating) against historical decisions with known outcomes. Use before any judgment skill goes live or into shadow operation, or when asked to grade an agent's decisions against a human's.
---

# Blind Backtest

Before an automated judgment stage touches production state, prove it against history. The trap this skill exists to avoid: a single agent that can see how cases actually resolved will leak outcomes into its judgments and produce a worthless score. Blinding is enforced by splitting roles across separate agents that never share context.

The coordinator (you, the session running this skill) holds the answer key and grades. Two subagents do the work:

## Phase 1: Assembler (sees outcomes — never judges)

Spawn a subagent that may read the historical record (Linear, GitHub, logs) to:

- **Select a balanced cohort** (~20 cases is usually enough to expose error structure): both outcome classes represented, ideally ~60/40. If one class is rare, say so rather than padding with weak cases.
- **Verify outcomes, don't assume them.** "Ticket Done" is weaker than "Done AND the PR merged"; "Canceled" is weaker than "canceled by a reviewer's judgment" (bulk sweeps and staleness cancellations are noisy labels — flag them in the key).
- **Sanitize each case into an input file** containing only what existed _before_ the human verdict: the plan/content under judgment and its cited evidence. Strip everything outcome-revealing: states, completion/cancel dates, merge status, post-decision comments, and identifiers (ticket/PR numbers → `[redacted]`) that the judge could look up.
- **Write** `inputs/` files (shuffled, opaque/neutral filenames like `case-01`, no class grouping) and `answer-key.json` (`{file, source, outcome, basis}`) to a scratch directory, then grep the inputs — contents, filenames, and any frontmatter — for leak terms (merged, closed, canceled, done, wontfix, approved, rejected, released, accepted, resolved) and justify any survivor.
- Report cohort size, balance, weak-label caveats, and any correlated cases (same family/mechanism) that could let the judge score unearned points.

## Phase 2: Blind judge (sees nothing but the inputs)

Spawn a separate subagent with an explicit blind protocol in its prompt:

- May read ONLY: the judgment skill under test (and its references), and the `inputs/` files.
- Forbidden, named explicitly: the answer key, the scratch directory's other files, Linear/GitHub/network, and anything that could reveal resolutions. Writes nothing.
- Must judge each case per the skill under test, outputting one structured line per case: verdict, confidence, classification, cited rules, one-line justification quoting the decisive content.
- Must flag cases it found genuinely borderline — those are where the grading discussion matters.

Never reuse the assembler as the judge; an agent cannot unsee outcomes.

## Phase 3: Grade (coordinator)

- Build the confusion matrix against the answer key. Escalations (needs-human) on a correct-outcome case count as _safe non-matches_, not errors — bouncing up is designed behavior — but track them as a distinct outcome and report the escalation rate separately, so an agent that escalates everything cannot look artificially safe.
- **Decompose every error before trusting the headline number.** The three buckets that recur:
  1. **Era artifacts** — the skill enforces conventions that postdate the historical cases (will vanish on live traffic; consider scoring without them, but say so).
  2. **Weak ground truth** — sweep-canceled, stale, or bulk-handled cases where the label doesn't reflect a judgment on quality.
  3. **Genuine misses** — the only bucket that demands a rule change.
- **Convert findings into amendments**: every genuine miss and every systematic era artifact becomes a concrete edit to the skill/rubric under test, applied immediately and noted with date + "backtest amendment" provenance.
- A backtest validates the _mechanism_ (verdicts cite checkable rules) and surfaces rule gaps.

## Output

Report, in order: cohort summary (size, balance, label caveats); confusion matrix — raw score first, then the decomposed/adjusted view with its assumptions; error decomposition by bucket; amendments applied; borderline cases worth a human look; and what this backtest does and does not establish — **promotion to live enforcement still requires live shadow agreement**, since historical labels are too noisy to clear a high bar alone.
