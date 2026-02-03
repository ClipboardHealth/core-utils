# prefer-array-methods

ESLint rule to prefer array methods (`.forEach`, `.map`, etc.) over for loops when there's no need for early exit control flow.

## Motivation

Array methods are more declarative and functional, and provide readability, clarity of intent, and method chaining.

Keep in mind, if you should break the loop early (e.g. for optimizing code), then it is preferred to use the for loop.
This is because functional loops like `map` and `forEach` cannot be exited early. (`some` and `every` can exit early; however, using them
to do so just for early exiting could lead to a lack of readability).

Another thing to keep in mind is that `await` does not work as expected within array methods.

This rule flags for loops that don't use any control flow statements, suggesting they could be refactored to use array methods.

### Examples

```typescript
// Invalid
const usingForLoop: number[] = [];
for (const item of items) {
  usingForLoop.push(item * 2);
}

// Valid
const usingArrayMethod = items.map((item) => item * 2);
```

```typescript
// Example 1. Valid: optimized for early exit
let totalPrice = 0;
let maxAllowedPrice = 500;
for (const [item, index] of items.entries()) {
  totalPrice += item.price;
  if (totalPrice >= maxAllowedPrice) break;
}

// Example 2. Valid: Skip items with continue.
for (const item of items) {
  if (!item.valid) continue;
  processItem(item);
}

// Alternative for Example 2 using array methods
items.forEach((item) => {
  if (!item.valid) {
    return; // slightly confusing, return doesn't end the forEach loop. For loop might be preferred.
  }
  processItem(item);
});

// Another alternative for Example 2 using array methods
items.forEach((item) => {
  if (item.valid) {
    processItem(item); // deeply nested of code rather than guard clause pattern can be less readable. For loop might be preferred.
  }
});

// Example 3. Valid: Return from enclosing function
function findItem(items: Item[]): Item | undefined {
  for (const item of items) {
    if (item.matches) return item;
  }
  return undefined;
}
```

### Async Loops

For async operations, the rule provides a specialized message encouraging parallel execution or use of `forEachAsyncSequentially`:

```typescript
// Bad: Sequential await without control flow
for (const item of items) {
  await processItem(item); // Error with specialized message
}

// Good: Parallel execution when possible
await Promise.all(items.map((item) => processItem(item)));

// Good: Sequential when required
import { forEachAsyncSequentially } from "@clipboard-health/util-ts";

await forEachAsyncSequentially(items, async (item) => {
  await processItem(item);
});
```

## Rule Details

This rule detects `for` and `for...of` loops that:

1. Don't have `break`, `continue`, or `return` statements at the outer loop level
2. Note: Control flow inside nested functions (callbacks, arrow functions) doesn't count

## Configuration

This rule is automatically applied to all `*.ts` files when using `@clipboard-health/eslint-config`.

## When to Disable

Disable this rule when you have a legitimate reason to use a for loop without control flow.

## Related

- [BP: TypeScript Style Guide](https://www.notion.so/BP-TypeScript-Style-Guide-5d4c24aea08a4b9f9feb03550f2c5310?source=copy_link#fb5599a17c4a456a839f2bb5654c371e)
- [`forEachAsyncSequentially` from @clipboard-health/util-ts](../../../../../util-ts/src/lib/arrays/forEachAsyncSequentially.ts)
