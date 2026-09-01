---
description: "Adding or restructuring React state, context, timers, subscriptions, or list rendering: where a changing value lives, hook return stability, what stays mounted"
---

# Render Scope

Where a changing value lives, what identity it has, what owns its updates and what stays mounted
decide how much of the tree re-renders when it changes. Each rule has a test you can answer from the
diff in front of you.

## A changing value lives at the lowest node that encloses its readers

One reader: the value is local to it. Several: their nearest common ancestor, and no higher. Every
node between the owner and a reader re-renders on every change, and nothing at the call site shows
it.

**Test:** name every node outside this one that reads the value _as it changes_. Zero: it belongs
here. A draft in a filter sheet or a multi-step form has zero outside readers until Apply or Submit;
the rest of the page reads the committed value, so the draft stays in the sheet or form and is
written out once. A per-item countdown has zero outside readers at all; it stays in the item.

## Every function and object a hook returns has a stable identity

A hook cannot see its consumers. Any function or object it returns may end up in a `memo` prop, a
`useMemo` or effect dependency, or a `constate` context, and a fresh identity on every render defeats
all of them. Wrap returned functions in `useCallback` and returned non-primitive values in `useMemo`.
Primitives are stable by value; memoizing them is waste. Consumers destructure, so memoizing the
whole return object adds nothing once its fields are stable.

**Test:** for each function or object in the return value, would `Object.is(previous, next)` hold
on a render where nothing changed?

```ts
// ❌ fresh setter and fresh derived object on every render
export function useFilters() {
  const [value, setValue] = useState(initialValue);
  return {
    value,
    active: Object.entries(value).filter(([, v]) => isDefined(v)),
    reset: () => setValue(initialValue),
  };
}

// ✅ each field stable across renders where nothing changed
export function useFilters() {
  const [value, setValue] = useState(initialValue);
  const active = useMemo(() => Object.entries(value).filter(([, v]) => isDefined(v)), [value]);
  const reset = useCallback(() => setValue(initialValue), []);
  return { value, active, reset };
}
```

Reference: [react.dev — Optimizing a custom Hook](https://react.dev/reference/react/useCallback#optimizing-a-custom-hook)

## A value that changes on its own has one owner

A value computed during render from a source React does not track — `Date.now()`, the viewport, a
ref, a store read without subscribing — has no cadence of its own. It updates only when something
else happens to re-render the component. It looks correct until an unrelated change removes that
render source, and then it silently freezes. The failure surfaces in a component nobody edited.

**Test:** does this component compute such a value during render, rather than receive it as a
prop? If so, is the trigger that re-renders it when the value changes — the state, interval or
subscription — in this component? If not, give it its own interval, or derive it from a timestamp
passed in as a prop.

## Not visible to the user means not subscribing

A closed sheet, a dismissed overlay or a list under a covering sheet stays mounted unless something
unmounts it, and keeps polling and ticking for the rest of the session. Unmounting is the strongest
form of this rule, not the only one: where the component must stay mounted to hold state, disable
its queries, clear its intervals and drop its subscriptions while it is hidden.

**Test:** for each query, interval or subscription this component owns, is it conditioned on the
component being visible to the user? If the component exists only to be shown, render it
conditionally so it unmounts instead.

## Filter before you render, not inside the child

Rendering N children that each return `null` still pays for N mounts, N props objects and N
reconciliations.

**Test:** does the parent map over items the child will reject?
