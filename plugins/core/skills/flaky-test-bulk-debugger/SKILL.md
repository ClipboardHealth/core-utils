---
name: flaky-test-bulk-debugger
description: Bulk-triage flaky test investigation tickets by clustering sightings, sharing artifacts, and delegating per-cluster diagnosis to core:flaky-test-debugger. Use when investigating many flaky test tickets, Linear issues tagged flaky-investigation, CI flake bursts, or repeated failures that may share a root cause.
---

# Flaky Test Bulk Debugger

Use this skill to investigate a queue of flaky test sightings efficiently. Its purpose is orchestration: collect tickets, build a compact manifest, cluster related failures, fetch shared artifacts once, then run `core:flaky-test-debugger` per cluster.

Do not duplicate the detailed diagnosis workflow from `core:flaky-test-debugger`. When a cluster is ready for root-cause analysis, use `core:flaky-test-debugger` in plan mode unless the user explicitly asks to implement fixes.

## Rules

- Treat bulky data as external artifacts. Save full issue descriptions, CI logs, LLM reports, Playwright traces, screenshots, and telemetry extracts to files; keep only manifests and summaries in conversation context.
- Cluster before per-test debugging. Do not read each test file independently until shared setup, CI, auth, static asset, backend, or infrastructure failures have been ruled out.
- Prefer one implementation ticket per root cause, not one per sighting.
- Preserve the source ticket instructions for labels, status, linked issues, PR body requirements, and close-out comments.
- If parallel workers are available, use them per cluster with minimal context. If not, process clusters serially and keep a running manifest file.
- Keep the coordinator responsible for queue state, deduplication, and Linear/bookkeeping; keep cluster workers responsible for evidence and diagnosis.

## Phase 1: Build Queue

Fetch or receive all candidate tickets. For Linear, filter by the user-provided project/status/label, commonly `Todo` plus `flaky-investigation`.

For each ticket, extract one manifest row: `issueId`, `repo`, `framework`, `testFile`, `testName`, `runUrl`, `commit`, `branch`, `shard`, `timestamp`, `firstError`, `firstStackFrame`, `priorTickets`, and `sourceInstructions`. Write full raw ticket data to a local artifact file if it is large.

## Phase 2: Cluster

Normalize errors before grouping:

- Replace random IDs, emails, names, phone numbers, shift/facility IDs, UUIDs, ObjectIds, hashes, ports, and timestamps with placeholders.
- Collapse generated asset filenames to their logical shape, for example `main-<hash>.<hash>.js`.
- Keep HTTP status codes, helper names, route names, endpoint paths, and lifecycle stages intact.

Cluster by strongest shared evidence first:

1. Same CI run, commit, timestamp window, and setup/helper stack.
2. Same failure surface from `core:flaky-test-debugger`: CI/job setup, test setup/auth/data, app bootstrap/navigation, user action, backend request, post-success render, assertion/locator.
3. Same first project stack frame or setup helper.
4. Same endpoint/static asset/status-code pattern.
5. Same test file or prior related tickets.

Do not merge clusters only because they are in the same run. Same-run failures can still have different root causes.

## Phase 3: Fetch Artifacts

For each unique CI run, fetch the available reports once and store them under a predictable temporary path. For Playwright LLM reports in Clipboard repos, use the repository helper when available:

```bash
bash scripts/fetch-llm-report.sh "<github-actions-url>"
```

Record artifact paths in the manifest. Workers should receive paths and the relevant manifest rows, not the full artifact contents.

## Phase 4: Diagnose Clusters

For each cluster, run `core:flaky-test-debugger` in plan mode. If the agent supports skills, explicitly load or invoke `core:flaky-test-debugger`; otherwise follow its workflow manually.

Use this worker prompt shape:

```text
Use core:flaky-test-debugger in plan mode.
Investigate this cluster as one possible shared root cause, not as isolated tickets.

Inputs: cluster summary, manifest rows, artifact/report paths, prior related tickets, and source ticket close-out instructions.

Return: final failure surface, evidence artifacts, root cause diagnosis, confidence score, whether one implementation ticket covers all issues, implementation plan or no-code disposition, and exact ticket action recommendation.
```

If confidence is below 5/5, the worker must include the observability or artifact changes needed to make the next occurrence diagnosable.

## Phase 5: Act

Merge worker outputs into a coordinator summary:

- Cluster name and issue IDs
- Shared vs independent root cause
- Evidence level and confidence
- Recommended implementation ticket count
- Tickets to mark duplicate/no-code/human-needed
- Remaining unknowns

Create or recommend implementation tickets only after clustering. Link all investigation tickets covered by the same root cause, plus prior related tickets from the source descriptions.

When updating investigation tickets, comment with the implementation ticket ID or no-code disposition, link related issues as requested, and move the ticket only after the comment/link exists.

## Output Format

End with a compact bulk triage report containing: queue size, cluster count, unique CI runs, each cluster's issue IDs, surface, recommendation, confidence, next ticket action, artifact index, and risks such as missing evidence or likely false merges.
