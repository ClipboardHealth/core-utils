---
name: deslop
description: Remove AI-generated slop from a git branch's diff against main, or from prose you draft. Use this whenever the user asks to deslop, "clean up this branch", "strip the AI slop", "remove AI tells", "de-AI this diff", or runs /deslop, typically before committing or opening a PR. Also apply the prose rules in this skill whenever drafting or cleaning a PR description, Slack message, or document for the user, so the output never carries AI writing tells (hedging, throat-clearing, bullet bloat, marketing adjectives, em-dashes). Triggers on phrases like "remove the slop", "make this not look AI-generated", "deslop this PR", "clean up the comments".
---

# Deslop

Strip AI-generated slop out of a branch diff or prose. Edit in place, change as little as possible, never break the build, never change behavior. Report with a 1-3 sentence summary at the end and nothing else.

Restraint governs. A false positive (removing real code or a real comment) is worse than a false negative (leaving some slop). When a removal is uncertain or would change runtime behavior, leave it and flag it in the summary.

## Mode selection

- **Code mode**: the request concerns a branch, diff, PR, or specific source files. Run the branch workflow below.
- **Prose mode**: the request concerns a PR description, Slack message, doc, email, or any text you are drafting or cleaning. Apply the prose rules. This also runs implicitly: any text you draft for the user must already satisfy the prose rules.

Both modes can apply at once (e.g. "deslop this branch and tidy the PR description").

## Code mode

### Scope

1. Make sure main is current, then compute what this branch introduced:

   ```bash
   git fetch origin main --quiet
   git diff origin/main...HEAD --name-only   # files this branch touched
   git diff origin/main...HEAD               # the actual added/changed lines
   ```

   Use the three-dot form. It diffs against the merge-base, so commits that landed on main after you branched are excluded. (Fall back to local `main` if `origin/main` is unavailable.)

2. For each touched file, read the **whole file**, not just the hunk. You cannot judge whether a comment or guard is out of place without the file's baseline style.
3. Only modify lines this branch added or changed. Never reformat, rename, or "improve" untouched lines. No whitespace churn.

### What counts as slop

#### Comments

- Restate the code: `// increment the counter` above `counter++`.
- Section headers an AI sprinkles in: `// --- Validation ---`, `// Helper functions`, `// Main logic`.
- Narrate the change instead of the code: `// Added this to fix the bug`, `// Refactored from the old version`.
- JSDoc / docstrings that only echo the signature: `@param userId The user id`.
- "Note:", "Important:", "Here we..." preambles on self-explanatory lines.

```ts
// slop
// Calculate the total by multiplying quantity and unit price
const total = quantity * unitPrice;
// clean
const total = quantity * unitPrice;
```

A comment is **not** slop if it records a non-obvious _why_: a workaround, an invariant, a gotcha, a ticket link, a reason the obvious approach was avoided.

#### Defensive code

- Null/empty/type guards on inputs already guaranteed by an upstream boundary: a class-validator DTO, the type system, a controller that already validated, a checked invariant.
- Optional chaining sprayed where the types guarantee presence (`a?.b?.c` when `a` is non-nullable).
- Fallbacks that mask bugs: `?? ''`, `|| []`, `?? 0` on values that should never be absent.
- try/catch that only logs and rethrows, or guards an impossible state.

```ts
// slop: dto is a validated CreateShiftDto, the controller already rejected bad input
async create(dto: CreateShiftDto) {
  if (!dto) throw new BadRequestException('dto is required');
  if (!dto.workplaceId) throw new BadRequestException('workplaceId is required');
  return this.repo.save(dto);
}
// clean
async create(dto: CreateShiftDto) {
  return this.repo.save(dto);
}
```

#### Type escapes

- `as any`, `: any`, `as unknown as X`, gratuitous non-null `!`, `@ts-ignore` / `@ts-expect-error` added to dodge a type error.
- If the correct type is determinable from the call site, the imported type, or the shape in use, replace the escape with the real type.
- If it is **not** determinable without deeper investigation, leave the cast and flag it in the summary. Do not silently delete it (breaks the build) or swap in a `// TODO` (more slop).

```ts
// slop
const config = JSON.parse(raw) as any;
// clean: type known from the call site
const config = JSON.parse(raw) as RetryConfig;
```

#### Other AI tells

- Tiny single-use helpers extracted for no reason; over-abstraction for a one-liner.
- Variable names noticeably more verbose or more terse than the file's norm.
- Leftover `console.log` / debug statements.
- Intermediate variables used once on the next line, where the file would inline them.

### What to never remove

- Error handling around real I/O, network, parsing, payments, or any external call.
- Anything whose removal changes runtime behavior on a reachable path. A try/catch that swallows an error and returns a default changes behavior if that path is hit. Leave it; note it.
- Guards in genuinely untrusted contexts: raw request bodies before validation, webhook payloads, third-party responses, anything crossing a trust boundary.
- Comments carrying a real why, a ticket link, or domain context.

### Verify before finishing

1. Run `git diff` (working tree, unstaged) to confirm your edits removed only the intended lines and touched nothing outside the branch's added lines. `git diff origin/main...HEAD` will _not_ show uncommitted edits, so use the plain working-tree diff.
2. If the project has one, run typecheck and lint (e.g. `npx tsc --noEmit`, `npm run lint`, `npx eslint <files>`). If something broke, you removed too much: restore it.

## Prose mode

Applies to PR descriptions, Slack messages, docs, and emails, whether cleaning text or generating it.

Cut:

- Throat-clearing openers: "In this PR, I've...", "This change introduces...", "I wanted to...".
- Hedging filler: "it's worth noting", "it's important to", "generally speaking", "as you may know".
- Marketing adjectives and trendy intensifiers: robust, seamless, comprehensive, powerful, leverage, streamline, delve, load-bearing.
- Rule-of-three padding and restating the obvious.
- Connective tissue that links sentences without adding content: "That said", "With that in mind", "To that end", "As such", "Moreover", "Furthermore", "Additionally", "It follows that". Drop the phrase or replace it with a full stop.
- Duplicated information: a point already made earlier in different words, a closing line that repeats the opening, a sentence that restates its own heading. Keep it once.
- Contradictory information: two statements in the same text that conflict (a number, a claim, or a recommendation stated one way then another). Keep the version that is correct and flag the contradiction; do not silently pick one if you cannot tell which is right.
- Bullet bloat where two sentences of prose are tighter; bold-everything formatting.
- Summary-of-the-summary closers: "In conclusion...", "Overall, this...".
- Em-dashes and double hyphens (use a comma, colon, or full stop instead).

Keep it concrete: what changed, why, what to check. Match the channel (a PR body is not a Slack one-liner).

```text
slop:  In this PR, I've made some changes to refactor the billing service. It's
       worth noting this is a fairly comprehensive update that should make the
       code more robust and maintainable.
clean: Refactors the billing service: extracts charge calculation into
       ChargeCalculator and removes the duplicated rounding logic.
```

Commit messages still follow Conventional Commits 1.0.

## Output

Make all edits silently, without narrating each change. End with a 1-3 sentence summary covering what categories you removed, roughly how much, and anything you left in place and flagged (unresolved `any` casts, behavior-changing guards too risky to touch). Nothing else.
