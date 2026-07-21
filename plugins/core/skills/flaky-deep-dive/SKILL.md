---
name: flaky-deep-dive
description: Investigate chronic flaky-test fingerprint families with a credential-checked, dossier-first, cross-repository causal-chain method and produce a designed fix or observability design for human review. Use when flaky-triage routes a family with at least three prior implementation tickets, flaky-critic routes a family with at least two failed merged fixes, or a user asks for the chronic flake deep-dive track.
---

# Flaky Deep Dive

Run a diagnosis-and-design investigation for a chronic fingerprint family. Produce a document for human review; never edit product code, create a fix branch, commit a fix, or open a fix PR.

Read the bundled [Home Health dry run](references/dry-run-home-health-full-lifecycle.md) for the expected dossier and causal narrative depth. Its structure is distilled from Rocky's `hh-full-lifecycle.md` and `staging-seed-reliability.md` reference deep dives; the Phase 6 checklist remains binding where the historical artifact records an evidence limitation.

Read and apply the shared
[`deployment-aware-recurrence.md`](../flaky-debug/references/deployment-aware-recurrence.md)
contract before classifying any deployed-service attempt as a failed fix.

## Phase 0: Enforce credential preconditions

Run the preflight before reading source code or diagnosing:

```bash
bash "<flaky-deep-dive-skill-dir>/scripts/check-prerequisites.sh" "${AWS_PROFILE:-sdlc}"
```

The preflight must prove all three:

1. `pup` can query Datadog APM spans and logs.
2. The staging API is reachable through the non-production VPN.
3. AWS read credentials are active through `aws sts get-caller-identity`.

If any check fails, stop the investigation. Do not continue with reduced evidence or silently cap confidence. File a provisioning ticket linked to the chronic ticket with:

- the fingerprint family and blocked investigation;
- the failed command and exact error class;
- the missing access: Datadog APM/log read, non-production VPN, or AWS `sdlc` read credentials;
- the causal-chain link or fault-injection step the access blocks;
- the remediation printed by the preflight.

If the environment cannot file Linear tickets, output the exact title and body for a human to file. Do not proceed blind.

For a CI-sourced E2E family, also prove access to the exact run and reporter artifact:

```bash
bash "<flaky-deep-dive-skill-dir>/../flaky-debug/scripts/fetch-llm-report.sh" \
  "<github-actions-url>"
```

If `gh` authentication fails, run `gh auth login --hostname github.com`. If the artifact expired, rerun the source workflow or obtain the `playwright-llm-report`/Playwright HTML report. An inaccessible source artifact blocks the investigation.

## Phase 1: Build the dossier first

Do not diagnose until the dossier is complete.

Read and follow `../flaky-debug/SKILL.md` Phase 1b in full. Its four unbounded Linear searches for the fingerprint family and exact test title are the canonical dossier recipe; do not narrow, copy, or alter them.

The chronic track adds these requirements for every implementation attempt returned by that recipe:

1. Read the ticket and investigation plan.
2. Read the complete PR diff, review discussion, merge state, and fix commit through `gh`.
3. Record what the attempt blamed and exactly what it changed.
4. Find a later same-mechanism sighting and classify it through the
   deployment-aware recurrence contract. A post-merge timestamp alone does not
   prove recurrence.
5. Check current `main` in every repository the attempt touched.

Create a `Prior attempts` table with these columns:

| Prior ticket/PR/commit | What it blamed | What it changed | Recurrence evidence |
| ---------------------- | -------------- | --------------- | ------------------- |

Every prior ticket, PR, and fix commit must appear. Attempt N+1 must rule out attempts 1..N: after the table, list each prior blamed mechanism and the evidence that falsifies it, limits it to one symptom, or proves it incomplete. A new attempt that merely repeats a prior mechanism is not a deep dive.

Also search open and closed-unmerged PRs labeled `flaky-test-fix`, plus recent `main` commits touching the test, helper, product surface, and implicated services. Stop and report if a current fix already covers the family.

## Phase 2: Resolve ownership from the workspace

Start from evidence, not the repository containing the test.

Read and follow the ownership and causal-chain rules in `../flaky-debug/references/plan.md`. The chronic track additionally requires recording the registry result and checkout SHA for every implicated repository.

Locate a `ClipboardHealth/groundtruth` checkout. Resolve deployed services through `registry/services.json`, then resolve repositories and owners through `registry/repos.json`:

```bash
jq --arg service "<service-id>" \
  '.services[] | select(.id == $service)' \
  "<groundtruth>/registry/services.json"

jq --arg repo "<repo-id>" \
  '.repos[] | select(.id == $repo)' \
  "<groundtruth>/registry/repos.json"
```

Read `context/devin-wiki/<repo>/` when it helps locate the owning code. Follow the causal chain into every implicated repository and inspect current `main`; never stop at the repository where the test lives. Record the resolved service, repository, owner, route or responsibility, and code checkout SHA in the deliverable.

If the registry is missing or cannot resolve an implicated service, treat ownership as a broken causal-chain link and design the registry/telemetry change needed to resolve it.

## Phase 3: Gather evidence across every link

Use all applicable evidence sources:

- **LLM reporter and Playwright artifacts:** identify the exact attempt, lifecycle step, network instance, request/response body, trace ID, request ID, screenshot, and stack.
- **Datadog APM:** follow the per-request backend-selected trace ID. Read `../flaky-debug/references/datadog-apm-traces.md` before querying.
- **Datadog run-window logs:** query the absolute CI window for seed operations, deploys, CDC lag, queues, background jobs, and other causal events outside the request path. A trace-only search cannot establish these events.
- **GitHub Actions:** use `gh run view`, job logs, annotations, artifacts, retry history, commit SHA, and deployed-version evidence.
- **AWS read-only evidence:** use the active staging credentials for service-specific read commands when Datadog and CI artifacts leave an AWS-managed link unresolved.
- **Current source:** cite file and line, config key, workflow step, or specific log event in the owning repository.

Preserve exact commands, absolute time windows, trace/request IDs, run URLs, commit SHAs, and zero-result limitations in the evidence appendix.

When a deployed service is implicated, retain the exact failure's service,
Datadog version, ECS task definition, and runtime source SHA. Resolve each linked
implementation PR's fix SHA, run and retain the ancestry check against the
failure runtime, then find the first successful deployment in that environment
whose runtime contains the fix. If runtime version/SHA is missing, the attempt
is `observability-blocked`: perform the provenance lookup and do not fall back to
merge time. Treat a different signature under the same test title as a new
mechanism.

## Phase 4: Terminate the causal chain

Apply the causal-chain and confidence rules in `../flaky-debug/references/plan.md` without changing their score meanings or valid terminal states.

Fault-injection reproduction is mandatory for 5/5. Use a focused lower-level test or harness control that delays, fails, reorders, throttles, or disables the blamed response or step. A normal green rerun is not reproduction.

When the chain is broken, do not design a speculative code fix. Convert the deliverable into the observability design that would terminate the chain on the next occurrence, including event names, fields, correlation IDs, service/repository, retention, reporter exposure, and the query that would prove or falsify the hypothesis.

## Phase 5: Design the fix for review

For a terminated chain, design the smallest fix at the terminal cause and name:

- owning repository, files, and team;
- behavior and contract changes;
- migration, rollout, and compatibility constraints;
- defensive apparatus or prior mitigations to delete after the fix;
- fault-injection and no-retry validation;
- residual risks and falsifying outcomes.

Separate the root fix from optional resilience or observability follow-ups. Do not turn another service's defect into a local test retry. Do not implement the design.

## Phase 6: Write the deliverable

Write Markdown to the user-specified path, or `/tmp/flaky-deep-dive-<fingerprint>.md` by default, with:

1. Title and metadata: family, repositories, status, investigator, current-main SHAs, confidence.
2. Credential preflight evidence.
3. `Dossier` and `Prior attempts`.
4. Latest recurrence signatures.
5. Causal chain with ownership resolution.
6. Root-cause statement and discriminated alternatives.
7. Designed fix, or `Observability design` when the chain is broken.
8. Fault-injection reproduction and validation plan.
9. Evidence appendix with links, commands, IDs, timestamps, and citations.

For each deployed-service prior attempt or recurrence, include the complete
deployment-provenance attachment from the shared contract. Preserve chronic
routing when the same mechanism is proven on a fix-containing runtime; do not
count stale runtimes or different mechanisms as failed fixes.

End with the document path/link and a one-sentence review request. Never open a direct fix PR.
