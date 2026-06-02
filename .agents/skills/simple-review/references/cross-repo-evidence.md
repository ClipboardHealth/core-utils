# Cross-repo evidence policy

Read this before raising or finalizing any cross-repo finding. Referenced from `SKILL.md`.

A finding's evidence is "cross-repo" when its load-bearing claim depends on code in any repo other than the one containing the diff — most commonly a producer, consumer, or downstream parser of something the diff changes. **Never silently read external repos** — they may be stale or you may have no checkout at all. Equally, **never claim a downstream impact you have not verified.** Speculating that "the FE will break" or "a consumer will choke on this" without reading the consumer is a top source of false-positive findings.

## When this policy fires

Treat a finding as cross-repo _before_ raising it whenever any of these apply:

1. The diff touches a **contract/schema package** (anything in `packages/contract-*`, `packages/*-contract*`, ts-rest contracts, JSON Schema files, OpenAPI specs, Protobuf, Avro, etc.) — consumers of these packages live in other repos by design.
2. The diff alters a **deployed-artifact boundary**: HTTP response shape, queue message shape, public SDK signature, exported library type, env-var contract, DB-record shape read by other services.
3. The failure mode you wrote references a downstream actor by role rather than name: _"the FE will…", "the mobile app will…", "consumers will…", "a rolling deploy will break for…"_ — you cannot verify any of those claims from inside the diff's repo alone.
4. The finding is a "backward-compatibility" or "rolling-deploy" concern about a producer change.
5. The finding's argument is "this diverges from how other consumers do X" — and "other consumers" are not in this repo.

If any of (1)–(5) is true, the finding is cross-repo. Move on to **Verify or downgrade** below before keeping it in your candidate list.

## Verify or downgrade (binding)

For each cross-repo finding:

1. **Identify the specific consumer/producer file(s)** you would need to read to confirm the claim. Be concrete: _"facility app's `useGetInvoiceBalances` hook to see whether it imports the contract schema and whether `.parse()` is strict."_ If you cannot name a specific artifact, the finding is speculative — drop it.
2. **Search likely locations you already have access to** before asking the user. Sibling repos under the same parent directory, monorepo workspaces, vendored copies. Use targeted `grep`/`git grep` — do not recursively scan the whole filesystem.
3. **If found locally**, run the **same freshness preflight** on that external repo (branch, dirty state, behind/ahead). Read context via `git show "${external_context_ref}:<path>"`, never via worktree filesystem. Note "verified against: `<repo>@<short-sha>`" in the finding.
4. **If not found locally**, ask the user for access using the template below. Do not raise the finding until the user has responded.
5. **If the user picks `skip`**, you have two choices:
   - **Drop the finding entirely** if the speculative version doesn't pass the litmus test ("concrete, current, product-visible cost").
   - **Keep as MINOR with explicit "speculative" prefix in the title** — only when the worst-case is genuinely concerning AND you can name the _assumption_ the finding rests on (e.g., _"assuming the FE imports this schema and parses strictly, then…"_). Make the assumption visible so the PR author can confirm or refute it.

Severity cap on any cross-repo finding is **MAJOR** until verified. Anything verified as actual breakage can be raised to its true severity.

## Access-request template

When asking the user for access to external repos, name the specific file and the specific question. Do not ask vaguely for "access to repo X" — ask for the evidence that would change your mind.

> One finding depends on code outside `<primary-repo>`. Before I raise it, I need to verify:
>
> **Finding:** `<short title>`
> **Claim:** `<what the finding asserts about the consumer/producer>`
> **What I need to read:** `<repo>/<path>` — to check `<specific question, e.g. "whether it imports GetFooResponseSchema and calls .strict() on it">`.
>
> Options:
>
> - **Local path** — give me an absolute path to a checkout (I'll run freshness preflight and read via `git show`).
> - **`gh:<owner>/<repo>`** — I'll fetch via `gh api repos/<owner>/<repo>/contents/<path>?ref=main`.
> - **`skip`** — I'll either drop the finding or keep it as MINOR with a "speculative — assumes `<assumption>`" prefix; you can confirm/refute.
> - **`skip all`** — apply `skip` to every remaining cross-repo finding.

## What "verify" means in practice

For a contract/schema change, the questions you must answer before claiming consumer impact are concrete:

- Does the consumer **import the contract schema directly**, or define its own local schema? (Local schema = your contract change has zero direct effect on the consumer's parser.)
- If it imports, does it call `.strict()`, `.passthrough()`, or rely on the default (strip unknowns)? Required fields missing → parse failure; extra fields → silently stripped under default.
- Is the consumer pinned to a published version of the package, or symlinked/workspace-resolved? Pinned → upgrade is explicit and the consumer team controls timing.
- Is the field actually read at runtime, or just typed? Type-only references don't fail at runtime even when the schema diverges.

For an API response change (without consumer-side schema):

- Does the consumer JSON-parse and read specific keys, or pass the body through opaquely (e.g. to a logger, to storage)?
- Does any layer in between (BFF, gateway) apply its own validation?

Answer these from real code, not from priors about "how FEs usually work." When you can't answer, you do not have a finding — you have a hypothesis.
