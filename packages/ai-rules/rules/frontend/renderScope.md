---
description: "Adding or restructuring React state, context, timers, subscriptions, or list rendering: where a changing value lives, hook return stability, what stays mounted"
---

# Render Scope

Where a changing value sits in the tree decides how much of the tree re-renders when it changes.
These are placement rules for the structure you are writing, not optimizations to apply after
profiling. Each has a test you can answer from the diff in front of you.

## A changing value lives at the narrowest node that reads it

State hoisted above its readers and a ticker mounted above its display are the same fault: every
node between the owner and the reader re-renders on every change, and nothing at the call site
shows it.

**Test:** name every node outside this one that reads the value before it is committed or
displayed. Zero → it belongs here. For a ticking value, find the nearest common ancestor of its
readers; if that is a route, a provider or a list container, it is too high.

Staged edits — a filter sheet, a multi-step form — stay local until Apply or Submit.

## An exported hook's return value is a public API with a stability contract

A fresh object or function identity on every render defeats every downstream `memo`, `useMemo` and
effect dependency, whatever the consumer does. Doubly so behind context or `constate`, where the
consumers are invisible from the hook.

**Test:** would `Object.is(previous, next)` hold on a render where nothing changed?

```ts
// ❌ fresh object and fresh setter identity on every render
export function useFilters() {
  const [value, setValue] = useState(initialValue);
  return { value, reset: () => setValue(initialValue) };
}

// ✅ stable across renders where nothing changed
export function useFilters() {
  const [value, setValue] = useState(initialValue);
  const reset = useCallback(() => setValue(initialValue), []);
  return useMemo(() => ({ value, reset }), [value, reset]);
}
```

## A value derived from the wall clock owns its cadence

A value computed from `Date.now()` during render has no cadence of its own — it updates only when
something else happens to re-render the component. It looks correct until an unrelated change
removes that render source, and then it silently freezes. The failure surfaces in a component
nobody edited.

**Test:** remove every other reason this component re-renders. Does the value still update? If not,
give it its own interval, or derive it from a timestamp passed in as a prop.

## Not visible means not subscribing

A closed sheet, a dismissed overlay or a list under a covering sheet stays mounted unless something
unmounts it, and keeps polling, ticking and re-rendering for the rest of the session. Unmounting is
the strongest form of this rule, not the only one: where the component must stay mounted to hold
state, disable its queries, clear its intervals and drop its subscriptions while it is hidden.

**Test:** while this is invisible, does it still fetch, tick, or re-render?

## Filter before you render, not inside the child

Rendering N children that each return `null` still pays for N mounts, N props objects and N
reconciliations.

**Test:** does the parent map over items the child will reject?
