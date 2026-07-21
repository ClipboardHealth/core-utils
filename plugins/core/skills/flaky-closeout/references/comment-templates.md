# Flaky Closeout Comment Templates

Fill every placeholder from fetched evidence. Do not post a state-changing
template with an unknown timestamp, mechanism, PR, or required runtime
provenance. A possible-supersession comment may use its explicit
missing-timestamp statement because it leaves state unchanged. Missing runtime
version/SHA, the observed runtime's deployment run, or the first fix-containing
deployment boundary for a deployed service is instead `observability-blocked`
and requires provenance lookup, not a possible-supersession guess.

## KB close-out

```markdown
<Use the canonical final close-out statement from
flaky-debug/references/fix.md verbatim.>

<!-- flaky-closeout: kb-done pr=<KB PR URL> -->
```

## Clear D3 supersession

For a non-deployed mechanism, use:

```markdown
Already fixed (D3): covered by merged PR <source PR URL> from <source ticket>.
It fixes the same mechanism: <mechanism and causal locus>. This ticket's
<signature class> sighting at <sighting timestamp> predates the fix at
<fix timestamp>.

Closing Done: the family enters the 21-day verifying window. If this mechanism
flakes again, the recurrence loop reopens the ticket with its history.

<!-- flaky-closeout: superseded-by=<source PR URL> -->
```

For a deployed service, use:

```markdown
Already fixed (D3): covered by merged PR <source PR URL> from <source ticket>.
It fixes the same mechanism: <mechanism and causal locus>. This ticket's
<signature class> sighting at <sighting timestamp> ran on a stale runtime that
does not contain the fix.

Deployment provenance:

- service: <service>
- environment: <environment>
- Datadog version: <version>
- ECS task definition: <family:revision>
- runtime SHA: <runtime SHA>
- runtime deployment run: <runtime deployment URL>
- fix PR / SHA: <source PR URL> / <fix SHA>
- signature relation: same
- mechanism relation: same
- ancestry: does-not-contain-fix (<command and exit status>)
- first fix-containing deployment: <run URL, runtime SHA, activation boundary>
- classification: pre-deployment/stale-runtime

Closing Done: the family enters the 21-day verifying window. If this mechanism
flakes again, the recurrence loop reopens the ticket with its history.

<!-- flaky-closeout: superseded-by=<source PR URL> -->
```

## Possible supersession

```markdown
@Rocky Warren possible supersession: merged PR <source PR URL> may cover this
ticket through <shared mechanism>, but <specific ambiguity> prevents a D3
closure. The relevant sighting is <timestamp or missing-timestamp statement>.
Please confirm the mechanism match; state is unchanged.

<!-- flaky-closeout: possible-supersession pr=<source PR URL> -->
```

## Bounce re-dispatch

```markdown
Re-dispatching for plan amendment after the critic verdict at <verdict link or
timestamp>.

Required amendment:

- <rule ID>: <specific missing or contradicted plan statement>

Amend the plan against the verdict, preserve the existing investigation
evidence, and resubmit it to the critic before implementation.

<!-- flaky-closeout: bounce-redispatch verdict=<comment ID or timestamp> -->
```
