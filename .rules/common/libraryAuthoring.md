---
description: "Authoring shared library code: @clipboard-health/* packages or shared library modules within services (e.g., src/lib)"
---

# Library Authoring

Applies when writing shared library code: `@clipboard-health/*` packages and shared library modules within services (e.g., `src/lib`).

- Use object arguments and object return types in library APIs; wrap exported responses in `ServiceResult`; prefer `ServiceResult` for expected errors and reserve throwing for unexpected/unrecoverable failures
- Library API types must not contain `any` or bare `object`; prefer specific types over `unknown`, but allow `unknown` when type safety requires caller-side narrowing; use TypeScript generics
- Define the public API exclusively through index exports (`src/index.ts` in packages); place non-public code in `internal/`
- Strive for 100% test coverage in library code (`/* istanbul ignore next */` only for genuinely untestable lines)
- When wrapping another library, design the API from first principles for our use cases; do not mirror the wrapped library's API or leak implementation details through interface names
