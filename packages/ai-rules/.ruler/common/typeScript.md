# TypeScript usage

- Use strict-mode TypeScript for all code; prefer interfaces over types.
- Avoid enums; use const maps instead.
- Strive for precise types. Look for type definitions in the codebase and create your own if none exist.
- Avoid using type assertions like `as` or `!` unless absolutely necessary.
- Use the `unknown` type instead of `any` when the type is truly unknown.
- Use an object to pass multiple function params and to return results.
- Leverage union types, intersection types, and conditional types for complex type definitions.
- Use mapped types and utility types (e.g., `Partial<T>`, `Pick<T>`, `Omit<T>`) to transform existing types.
- Implement generic types to create reusable, flexible type definitions.
- Utilize the `keyof` operator and index access types for dynamic property access.
- Implement discriminated unions for type-safe handling of different object shapes where appropriate.
- Use the `infer` keyword in conditional types for type inference.
- Leverage `readonly` properties for function parameter immutability.
- Prefer narrow types whenever possible with `as const` assertions, `typeof`, `instanceof`, `satisfies`, and custom type guards.
- Implement exhaustiveness checking using `never`.

