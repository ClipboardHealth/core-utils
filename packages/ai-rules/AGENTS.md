---
alwaysApply: true
---

<!-- Source: .ruler/codeStyleAndStructure.md -->

# Code style and structure

- Write concise, technical TypeScript code with accurate examples.
- Use functional and declarative programming patterns.
- Prefer iteration and modularization over code duplication.
- Use descriptive variable names with auxiliary verbs (e.g., isLoading, hasError).
- Structure files: constants, types, exported functions, non-exported functions.
- Avoid magic strings and numbers; define constants.
- Use camelCase for files and directories (e.g., modules/shiftOffers.ts).
- When declaring functions, use the `function` keyword, not `const`.
- Prefer data immutability.

<!-- Source: .ruler/errorHandlingAndValidation.md -->

# Error handling and validation

- Sanitize user input.
- Handle errors and edge cases at the beginning of functions.
- Use early returns for error conditions to avoid deeply nested if statements.
- Place the happy path last in the function for improved readability.
- Avoid unnecessary else statements; use the if-return pattern instead.
- Use guard clauses to handle preconditions and invalid states early.
- Implement proper error logging and user-friendly error messages.
- Favor `@clipboard-health/util-ts`'s `Either` type for expected errors instead of `try`/`catch`.

<!-- Source: .ruler/keyConventions.md -->

# Key conventions

- You are familiar with the latest features and best practices.
- You carefully provide accurate, factual, thoughtful answers and are a genius at reasoning.
- You always write correct, up-to-date, bug-free, fully functional, working, secure, easy-to-read, and efficient code.
- If there might not be a correct answer or do not know the answer, say so instead of guessing.

<!-- Source: .ruler/nestJsApis.md -->

# NestJS APIs

- Use a three-tier architecture:
  - Controllers in the entrypoints tier translate from data transfer objects (DTOs) to domain objects (DOs) and call the logic tier.
  - Logic tier services call other services in the logic tier and repos and gateways at the data tier. The logic tier operates only on DOs.
  - Data tier repos translate from DOs to data access objects (DAOs), call the database using either Prisma for Postgres or Mongoose for MongoDB, and then translate from DAOs to DOs before returning to the logic tier.
- Use ts-rest to define contracts using Zod schemas, one contract per resource.
- A controller implements each ts-rest contract.
- Requests and responses follow the JSON:API specification, including pagination for listings.
- Use TypeDoc to document public functions, classes, methods, and complex code blocks.

<!-- Source: .ruler/react.md -->

# React

- Destructure props in function body rather than in function signature
- Prefer inline JSX rather than extracting variables and functions as variables outside of JSX
- Use useModalState for any showing/hiding functionality like dialogs
- Utilize custom hooks to encapsulate and reuse stateful logic
- When performing data-fetching in a custom hook, always use Zod to define any request and response schemas
- Use react-hook-form for all form UIs and use zod resolver for form schema validation
- Use date-fns for any Date based operations like formatting

<!-- Source: .ruler/testing.md -->

# Testing

- Follow the Arrange-Act-Assert convention for tests with newlines between each section.
- Name test variables using the `mockX`, `input`, `expected`, `actual` convention.
- Aim for high test coverage, writing both positive and negative test cases.
- Prefer `it.each` for multiple test cases.
- Avoid conditional logic in tests.

<!-- Source: .ruler/typeScript.md -->

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

<!-- Source: .ruler/uiAndStyling.md -->

# UI and Styling

- Use Material UI for components and styling and a mobile-first approach.
- Favor TanStack Query over "useEffect".

<!-- Source: .ruler/zOverlay.md -->

# Overlay

- If an ./OVERLAY.md file exists, read it for additional rules.
