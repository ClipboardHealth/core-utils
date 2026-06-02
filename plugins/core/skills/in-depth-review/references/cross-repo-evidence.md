# Cross-repo evidence policy (binding for all agents)

Read this before raising or finalizing any finding whose evidence may live outside the repo containing the diff. Referenced from `SKILL.md`.

A finding's evidence is "cross-repo" when it depends on code in any repo other than the one containing the diff. Examples: the diff is in `clipboard-health` but the finding claims that `cbh-admin-frontend`, `payment-service`, or `worker-service-backend` still calls a deprecated endpoint.

**Subagents must NOT silently read external repos.** Doing so risks (a) reading a stale local checkout and fabricating evidence (see "Freshness preflight"), or (b) citing a path the user has no checkout of, which the moderator can't verify.

Subagent rule: if a finding's load-bearing evidence is in another repo, the subagent must emit the finding with the additional field:

```json
"evidence_required": {
  "repos": ["cbh-admin-frontend", "payment-service"],
  "what_to_verify": "concrete grep / file path / question the moderator should answer to confirm or kill the finding"
}
```

…and cap the finding's severity at **MAJOR**. Findings marked `evidence_required` cannot be CRITICAL until the moderator has confirmed the cross-repo evidence on a verified-fresh ref.

Moderator rule: after Round 1, collect every `evidence_required` block across all subagents and ask the user **before Round 2**:

> Some findings depend on code outside `<primary-repo>`. To verify, I need access to:
>
> - `<repo-1>` — to check `<what_to_verify>` (raised by agent <X>)
> - `<repo-2>` — to check `<what_to_verify>` (raised by agent <Y>)
>
> For each repo, reply with one of:
>
> - a local path (e.g. `/Users/you/repos/cbh/<repo>`) — I will run the freshness preflight on it before reading
> - `gh:<owner>/<repo>` — I will fetch the file content via `gh api repos/<owner>/<repo>/contents/<path>?ref=main` instead of cloning
> - `skip` — the finding will be downgraded to "speculative — cross-repo evidence not verified" and capped at MINOR
>
> Or reply `skip all` to downgrade every cross-repo finding.

For each user-provided local path, run the **same freshness preflight** as on the primary repo (fetch, check ahead/behind, check working-tree cleanliness). If the external repo is stale or on a non-default branch, warn with the same template and require explicit user acknowledgement before reading. Always read external code via `git show "${external_context_ref}:<path>"` / `git grep ... "${external_context_ref}" -- <paths>`, never via the worktree filesystem.

After verification, re-dispatch only the affected subagents (one agent per repo group) with the verified evidence (or its absence) inlined, so they can finalize severity for Round 2. Findings whose cross-repo evidence the user `skip`s are kept but capped at MINOR with a "speculative" prefix in the title.
