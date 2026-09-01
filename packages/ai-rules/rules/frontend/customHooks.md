---
description: "Creating React custom hooks: naming, shared state with constate"
---

# Custom Hooks

## Naming

- Boolean: `useIs*`, `useHas*`, `useCan*`
- Data: `useGet*`, `use*Data`
- Actions: `useSubmit*`, `useCreate*`

## Shared State with Constate

Wrap a hook with `constate` to get a tuple you destructure in order — `const [<Feature>Provider, use<Feature>Context] = constate(useFeature)`. Use it for sharing state between siblings and for feature-level state; not for server state (use React Query) or simple parent-child passing (use props).

A wrapped hook's return value is a stability contract for every consumer, and those consumers are
invisible from the hook. Apply the stability test in `frontend/renderScope` before wrapping.
