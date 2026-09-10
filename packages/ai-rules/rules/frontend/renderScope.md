---
description: "Adding or restructuring React state, context, hook returns, wall-clock values, hidden queries/subscriptions, or list filtering"
---

# Render Scope

Apply every test matching the structure in the diff. Choose boundaries from required consumers and
lifecycle, not component size.

## Own changing values at the closest shared scope

Place live state at the closest scope that reaches every consumer that must coordinate on it and
preserves its required lifetime. That scope may be a leaf, list, route or provider. Keep draft state
local to its editor until Apply or Submit unless another live consumer must share it.

**Test:** list every reader and writer that must observe the same live value, plus the lifetime it
must survive. The owner passes only when it is the closest shared scope that reaches the full list
and preserves that lifetime. For each level above that closest scope up to the current owner, name
the additional consumer or lifetime requirement that forces it; no answer means the value is
scoped too high.

## Stabilize identities at reference-sensitive boundaries

Fresh object or function identities affect rendering when the exact reference reaches a boundary
that compares it: a context or `constate` value, a dependency-array entry (`Object.is`), or a
memoized prop (its configured comparison). Exporting a hook alone creates no whole-return stability
contract. Stabilize the compared value, not every wrapper.

**Test:** trace every object and function that reaches one of these boundaries and name where that
exact reference is compared. At every named boundary, verify semantically unchanged renders
preserve identity and changes that the boundary must observe replace it. With no such boundary, use
the value directly.

## Give wall-clock behavior an explicit cadence

When rendered behavior must change as time passes, reading `Date.now()` computes a value but does
not schedule another render. Drive recomputation with an explicit state update, timer or
subscription emission, or a changing prop whose source has the required cadence.

**Test:** state the maximum permitted staleness, remove every unrelated render source, and trace the
explicit update that recomputes the value within that bound. No trace means the cadence is missing.

## Give hidden work a current beneficiary

A covered or closed subtree can have legitimate background work: it may feed a visible consumer,
complete an active operation, or meet an explicit freshness requirement. Otherwise pause its
queries, timers and subscriptions or unmount it. When remaining mounted preserves UI state, pause
unrelated work without discarding that state.

**Test:** while the subtree is hidden, enumerate every query, timer and subscription. For each, name
its current consumer or operation, or state its freshness bound and verify the cadence matches.
Pause or clean up every entry with no beneficiary; unmount the subtree only when its state and
lifecycle may reset.

## Filter at the collection owner when absence is intended

Filtering before mapping avoids mounting rejected children. A child that returns `null` remains
mounted; moving its predicate to the parent cleans up its effects but also resets its local state
and lifecycle.

**Test:** for every excluded child, inventory its local state, effects, subscriptions and re-entry
behavior. Parent filtering passes only when cleanup and fresh state on re-entry are intended; then
verify excluded items are absent from the mounted tree. When continuity is required, keep the child
mounted and apply the hidden-work test.
