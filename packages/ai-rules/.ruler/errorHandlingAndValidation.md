# Error handling and validation

- Sanitize user input.
- Handle errors and edge cases at the beginning of functions.
- Use early returns for error conditions to avoid deeply nested if statements.
- Place the happy path last in the function for improved readability.
- Avoid unnecessary else statements; use the if-return pattern instead.
- Use guard clauses to handle preconditions and invalid states early.
- Implement proper error logging and user-friendly error messages.
- Favor `@clipboard-health/util-ts`'s `Either` type for expected errors instead of `try`/`catch`.
