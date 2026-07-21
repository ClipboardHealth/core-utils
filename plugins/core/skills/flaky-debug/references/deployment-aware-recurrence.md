# Deployment-Aware Recurrence Classification

Use this contract whenever a flaky failure implicates a deployed service and a
linked implementation PR may already cover the same mechanism. PR merge time is
not evidence that the fix was running in the failure's environment.

## Required provenance record

Build the record from the exact failing attempt, request, trace, log, or task.
Retain every value even when the final classification does not count as a
recurrence:

- failure signature and causal mechanism;
- failure timestamp and environment;
- service and owning repository;
- Datadog `version` or image tag;
- ECS task-definition family and revision;
- full runtime source SHA;
- linked implementation PR and full fix SHA;
- deployment workflow run for the observed runtime;
- ancestry command and result;
- first successful deployment in the same environment whose runtime contains
  the fix, including its runtime SHA, run URL, and runtime-activation boundary.

Record an absent field as `missing`; do not silently omit it. A Datadog version
or source SHA from a nearby request, another retry, or the CI checkout is not the
runtime provenance of the exact failure.

Within one run, fetch deployment history once per service and environment.
Cache first-fix-containing deployment lookups by
`<repository, fix SHA, service, environment>` and ancestry results by
`<fix SHA, runtime SHA>`. A fix-containing deployment cannot predate the fix
commit, so begin that search at the fix commit time. Reuse an exact provenance
attachment across later pipeline stages only after confirming it identifies the
same failing attempt and environment.

## Decision procedure

1. Compare failure signatures and causal mechanisms before comparing time or
   commits. Recurrence requires both to match. A different signature under the
   same test title, or the same signature from a different causal mechanism, is
   a **new mechanism**, not recurrence of the linked fix. An unresolved
   mechanism blocks recurrence judgment until the causal evidence is complete.
2. Resolve the fix SHA from the linked implementation PR in the deployed
   service's repository. Use the PR's fix-bearing merge commit (the squash
   commit for a squash merge) and retain the PR URL and repository.
3. Resolve the exact failure's service, Datadog version, ECS task definition,
   and runtime source SHA. If the Datadog version or runtime SHA is missing,
   classify **observability-blocked** and perform a provenance lookup. Do not
   substitute the PR merge timestamp.
4. In the service repository, fetch the necessary commits and run
   `git merge-base --is-ancestor <fix-sha> <runtime-sha>`. Retain the command,
   full SHAs, and exit status. Exit `0` means `contains-fix`; exit `1` means
   `does-not-contain-fix`; any other result is **observability-blocked** until
   repository provenance is repaired.
5. Search successful deployments for the same service and environment in
   chronological order. The first runtime SHA for which the ancestry command
   succeeds defines the **first fix-containing deployment boundary**. Use the
   recorded time at which that runtime became active; use workflow start or
   completion only when the deployment evidence establishes that as the
   activation boundary. Never use PR merge time as a proxy. If the observed
   runtime's deployment run or the first fix-containing deployment boundary
   cannot be resolved, classify the state-changing decision
   **observability-blocked** until the deployment lookup completes.
6. Apply the table below. A state-changing D3 close, failed-fix count, or
   chronic escalation must carry the complete decision record.

The first fix-containing deployment is the boundary for searching and auditing
later recurrence. Exact runtime ancestry remains authoritative during rolling
deployments: a stale task can serve a failure after that boundary and still
classifies `pre-deployment/stale-runtime`.

| Signature / mechanism relation | Runtime evidence                   | Ancestry               | Classification                 | Pipeline effect                                                                    |
| ------------------------------ | ---------------------------------- | ---------------------- | ------------------------------ | ---------------------------------------------------------------------------------- |
| Both same                      | Version or runtime SHA missing     | Unknown                | `observability-blocked`        | Require provenance lookup; no D3 close and no failed-fix count                     |
| Both same                      | Deployment run or boundary missing | Known                  | `observability-blocked`        | Require deployment lookup; no D3 close, failed-fix count, or chronic escalation    |
| Both same                      | Exact runtime resolved             | `does-not-contain-fix` | `pre-deployment/stale-runtime` | Do not count as a failed merged fix; attach the fix-containing deployment boundary |
| Both same                      | Exact runtime resolved             | `contains-fix`         | `genuine-post-fix-recurrence`  | Count as failed-fix evidence; preserve chronic-family routing                      |
| Either differs                 | Any                                | Any                    | `new-mechanism`                | Route by signature and mechanism, not test title; do not count against the fix     |

## Decision attachment

Attach this block to the triage, critic, deep-dive, or closeout decision:

```text
Deployment provenance:
- service: <service>
- environment: <environment>
- Datadog version: <version or missing>
- ECS task definition: <family:revision or missing>
- runtime SHA: <full SHA or missing>
- runtime deployment run: <URL or missing>
- fix PR / SHA: <PR URL> / <full SHA>
- signature relation: <same | different>
- mechanism relation: <same | different | unresolved>
- ancestry: <contains-fix | does-not-contain-fix | blocked> (<command and exit status>)
- first fix-containing deployment: <run URL, runtime SHA, activation boundary>
- classification: <observability-blocked | pre-deployment/stale-runtime | genuine-post-fix-recurrence | new-mechanism>
```

Use `lookup pending` only in a non-state-changing interim report that is
explicitly classified `observability-blocked`. A D3 close, failed-fix count, or
chronic escalation requires the observed-runtime deployment run and the first
fix-containing deployment boundary.

## Deterministic regression table

These incident-derived cases are the minimum table-driven coverage for changes
to recurrence, D3, or chronic routing. The short SHAs are stable fixture labels;
live decisions retain full SHAs.

| Runtime      | Fix          | Signature                                                         | Ancestry result | Expected classification        | Expected routing                                                               |
| ------------ | ------------ | ----------------------------------------------------------------- | --------------- | ------------------------------ | ------------------------------------------------------------------------------ |
| `0e396e1b88` | `2f0a47273d` | Same signature and mechanism                                      | Exit `1`        | `pre-deployment/stale-runtime` | Do not count as a failed fix; boundary is the first deployment of `9d32b50bdd` |
| `9d32b50bdd` | `2f0a47273d` | Same signature and mechanism                                      | Exit `0`        | `genuine-post-fix-recurrence`  | Count the failed fix and preserve chronic-family routing                       |
| Missing      | `2f0a47273d` | Same signature and mechanism                                      | Not runnable    | `observability-blocked`        | Require exact runtime lookup; do not infer from merge time                     |
| `9d32b50bdd` | `2f0a47273d` | Different read-model signature and mechanism under the same title | Exit `0`        | `new-mechanism`                | Route by the new signature; do not count against this fix                      |
