# Decide the Fix and Format the Plan

Shared tail of the flaky-debug planning phase, used by both [`plan-e2e.md`](./plan-e2e.md) and [`plan-fast-path.md`](./plan-fast-path.md). Produces a structured plan that the user reviews. In fix mode, the plan is consumed by [`fix.md`](./fix.md).

## Confidence Score

Rate your confidence in the root cause on a 1-5 scale. Report this score alongside your evidence.

| Score | Meaning             | Criteria                                                                                                                                                                                                                                                           |
| ----- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **5** | Certain             | Root cause is directly visible in artifacts AND reproduced by inducing it — fault injection in the harness (delay/fail the blamed response or step) or a focused lower-level test that deterministically triggers the race. Without reproduction, the ceiling is 4 |
| **4** | High confidence     | The chain terminates at an evidenced cause (file/line, config key, or log line) but one intermediate link is inferred rather than observed. An unevidenced terminal cause is a broken chain, capped at 2 (see [Causal Chain](#causal-chain))                       |
| **3** | Moderate confidence | Evidence is consistent with the diagnosis but alternative explanations remain plausible. Flag the alternatives explicitly                                                                                                                                          |
| **2** | Low confidence      | Limited evidence, mostly reasoning from code patterns rather than observed artifacts. Recommend gathering more data before committing to a fix                                                                                                                     |
| **1** | Speculative         | No direct evidence for the root cause. The fix is a best guess. Recommend reproducing the failure locally or adding instrumentation before proceeding                                                                                                              |

Apply the score:

- **If >2:** continue to [Decide Fix Approach](#decide-fix-approach).
- **If less than 5/5:** the plan must include the frontend and/or backend observability changes that would make the next occurrence's root cause directly visible in artifacts (the artifact half of 5/5; reaching 5/5 additionally requires reproduction per [Causal Chain](#causal-chain)). Scope recommendations to the repositories and services on the causal chain; resolve owners via the groundtruth registry rather than assuming the failure belongs to the repo the test lives in.
- **If confidence is 2 or below:** do not propose a code fix. Instead, recommend specific instrumentation or reproduction steps to raise confidence.

## Causal Chain

Every plan must trace the failure to a terminal _cause_, not a symptom:

failing assertion → app/UI state → network/trace/log evidence → owning service and repo → cause at a file/line, config key, or specific log line.

- A status code, timeout, or throttle is a link in the chain, never the terminus. "The request 500ed" or "setup was throttled" is where the investigation continues, not where it stops.
- The link types adapt to the failure surface. CI/setup, fixture, component, and unit failures substitute build logs, fixture state, or runner artifacts for network evidence, and the owning package/repo for a deployed service. The invariant is the terminus — a cause, not a symptom — not the specific link types.
- When a network request or deployed service is implicated, resolve its owning service and repo via the groundtruth ownership registry (`ClipboardHealth/groundtruth`: `registry/services.json` → `registry/repos.json`; per-repo context in `context/devin-wiki/<repo>/`). Follow the chain into that repo's code — do not stop at the repo the test lives in.
- When the causal event may be outside the test's own request path (seeding, deploys, CDC lag, async jobs), trace-ID lookup cannot reach it. Use time-window log queries scoped to the run instead.
- If evidence runs out, state exactly which link breaks and what observability would extend it. That caps confidence at 2, and the instrumentation becomes the deliverable.

## Decide Fix Approach

Applies to all test types.

Choose the fix locus from the evidence, not from where the assertion failed. A flaky E2E test can be exposing a CI dependency issue, auth/test-data service issue, backend bug, deployment problem, product state bug, or test harness bug.

Use this decision order:

1. **Shared setup or CI fix** when many tests fail before user-flow assertions or all failures share a tool, cache, install, auth, seed-data, or fixture path.
2. **Backend/service/data fix** when the expected request is emitted and backend telemetry or response bodies show errors, throttling, stale data, inconsistent state, or unexpected latency.
3. **Product fix** when real users can hit the same unsafe intermediate state, render error, permission/session race, stale cache, or missing error handling.
4. **Test data or harness fix** when the scenario is not user-realistic, the test setup is semantically wrong, or the test needs a deterministic app-ready signal.
5. **Assertion/locator fix** only when the app state is correct and the selector/assertion is the only broken part.

Before proposing any retry, timeout, or wait change, pass the idempotency check:

- Is the retried operation safe to repeat?
- Does retrying preserve the same test scenario?
- Could retrying amplify the root cause, such as rate limits, one-time credentials, duplicate writes, or destructive mutations?
- Is there a deterministic signal to wait on instead of a longer timeout?

If the answer is no or unclear, do not add a retry/wait as the fix. Propose a root-cause fix or instrumentation instead.

Common valid fix types:

- **Shared setup / CI**
  - Pin or lock runtime tools and dependencies
  - Fail fast on incompatible tool contracts
  - Remove mutable global state from CI setup
  - Add setup-level diagnostics before sharding

- **Test harness / data** (when the failure is non-product):
  - Reset cookies, storage, and session between retries
  - Isolate test data; generate stronger unique identities
  - Make retry blocks idempotent
  - Wait on deterministic app signals, not arbitrary sleeps
  - (Service tests) Close connections and app properly in `afterAll`
  - (Component tests) Flush pending state updates and timers before asserting
  - (Unit tests) Reset shared mutable state in `beforeEach`

- **Product** (when real users would hit the same issue):
  - Handle stale or intermediate states safely
  - Make routing/render logic robust to eventual consistency
  - Add telemetry for ambiguous transitions

- **Backend/service**
  - Remove avoidable shared mutable writes from hot paths
  - Make setup operations idempotent or explicitly rate limited
  - Fix stale reads, cache invalidation, and eventual-consistency assumptions
  - Add trace/log correlation for ambiguous failures

Choose **both** if user impact exists _and_ tests are fragile.

## Plan Output Format

Produce the plan with these fields:

- **Test ID:** if provided in prompt
- **Agent session ID:** your running session ID to resume if needed
- **Confidence:** score (1-5) with brief justification
- **Failure surface:** CI/job setup, test setup/auth/data, app bootstrap, user action no-op, backend request, post-success render, assertion/locator, or mixed
- **Current main status:** whether the failing commit's code path still exists on current `main`, has already been fixed, or has changed enough that the plan must be adjusted
- **Prior attempts:** list each prior ticket/PR, what it blamed, what it changed, and the recurrence evidence showing its diagnosis was wrong or incomplete. Use a table with `Prior ticket/PR`, `What it blamed`, `What it changed`, and `Recurrence evidence` columns. If the dossier search found no prior implementation tickets, write `None found` and include the fingerprint-family and exact-test-title searches run.
- **Symptom:** what failed and where
- **Root cause:** concise technical explanation
- **Causal chain:** each link from failing assertion to terminal cause with its evidence, or the explicit break point and the observability that would extend it (see [Causal Chain](#causal-chain))
- **Evidence:** artifacts supporting the diagnosis (traces, network, error messages, screenshots as applicable)
- **Proposed fix:** test harness, product, or both — with the specific file(s) and the change you would make
- **Observability to reach 5/5:** required when confidence is less than 5/5. List the frontend and/or backend telemetry, logging, tracing, reporter, or metric changes that would make this flake's root cause directly visible in artifacts next time (reproduction then completes 5/5). Include another repository only when the evidence implicates it. Use "N/A -- confidence is 5/5" only for a 5/5 plan.
- **Sibling candidates:** files that appear to share the same anti-pattern, for the reviewer (or fix.md) to confirm. Or "N/A -- fix is test-specific" if the issue is one-off (see [`fix.md`](./fix.md) for what counts as a structural anti-pattern worth searching for).
- **Sibling-repo check:** for a mechanism plausibly shared between `cbh-admin-frontend` and `cbh-mobile-app`, state the sibling repository, current `main` commit searched, exact helper names or grep-able code patterns, commands and scope, and matches found (or `None found`). A mechanism is plausibly shared when the proposed fix touches the test harness, authentication/session/bootstrap, cache, API client, or a copied capability, helper, or convention. If the same mechanism is present, state that the fix deliverable will include a linked mirror implementation ticket following the Groundcrew ticket conventions, linked to the source implementation ticket and referencing the landed source fix as the pattern to adopt. If the mechanism is not plausibly shared, state `N/A` and why. Use the concrete search recipe in [`fix.md`](./fix.md#validate-the-sibling-frontend-check).
- **Validation plan:** lint/typecheck commands and test commands to run after applying the fix
- **Open questions:** anything that needs human input before fixing
- **Residual risk:** what could still be flaky after the fix
