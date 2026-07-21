# Flaky Closeout Comment Templates

Fill every placeholder from fetched evidence. Do not post a state-changing
template with an unknown timestamp, mechanism, or PR. A possible-supersession
comment may use its explicit missing-timestamp statement because it leaves state
unchanged.

## KB close-out

```markdown
<Use the canonical final close-out statement from
flaky-debug/references/fix.md verbatim.>

<!-- flaky-closeout: kb-done pr=<KB PR URL> -->
```

## Clear D3 supersession

```markdown
Already fixed (D3): covered by merged PR <source PR URL> from <source ticket>.
It fixes the same mechanism: <mechanism and causal locus>. This ticket's
<signature class> sighting at <sighting timestamp> predates the merge at
<merge timestamp>.

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
