---
name: humanize-prose
description: Strip AI writing tells from prose you draft or clean: PR descriptions, Slack messages, docs, emails, commit messages. Cuts hedging, throat-clearing, marketing adjectives, bullet bloat, connective filler, and em-dashes. Use whenever the user asks to "humanize" text, "remove the AI slop" from writing, "make this not sound AI-generated", "deslop this PR description", or runs /humanize-prose. Also applies implicitly: any prose you draft for the user must already satisfy these rules.
---

# Humanize prose

Strip AI writing tells out of prose, whether cleaning existing text or generating it. Edit in place, change as little as possible, preserve meaning. When a change would alter meaning, or you cannot tell which of two conflicting statements is correct, leave it and flag it.

Applies to PR descriptions, Slack messages, docs, and emails.

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

Make edits silently, without narrating each change. End with a 1-3 sentence summary of what categories you cut and anything you left in place and flagged (a contradiction you could not resolve). Nothing else.
