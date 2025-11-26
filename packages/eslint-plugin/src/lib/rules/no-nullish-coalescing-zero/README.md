# no-nullish-coalescing-zero

ESLint rule to warn against using `?? 0`, `|| 0`, or `&& 0` without considering whether zero is the appropriate business default.

## Motivation

When dealing with nullable numeric values, developers often use operators with zero as a fallback (`value ?? 0`, `value || 0`) or as a result (`value && 0`). While syntactically correct, these patterns can mask important business logic issues:

1. **Zero may not be a valid default**: In many business contexts, a missing value should be treated as an error rather than defaulting to zero. For example, a missing price, quantity, or rate might indicate data corruption or a bug that should be surfaced.

2. **Silent failures**: Using `?? 0` can hide bugs where a value was expected but not provided, making debugging difficult.

3. **Business semantics matter**: Zero often has specific business meaning (e.g., "no charge", "empty inventory", "zero balance"). Defaulting to zero when a value is missing conflates "intentionally zero" with "unknown/missing".

### The Problem

Consider this problematic pattern:

```typescript
// Calculating total price
const price = product.price ?? 0;
const quantity = order.quantity ?? 0;
const total = price * quantity;
```

If `product.price` is unexpectedly `null` due to a database issue, the customer gets charged $0 instead of the system raising an error. This could result in significant revenue loss before the bug is detected.

### The Solution

Think carefully about each case:

```typescript
// Option 1: Treat missing values as errors using isDefined from @clipboard-health/util-ts
if (!isDefined(product.price)) {
  throw new Error("Product price is missing");
}
const total = product.price * quantity;

// Option 2: Use a type-safe result type
const priceResult = getProductPrice(productId);
if (priceResult.isErr()) {
  return handleMissingPrice(priceResult.error);
}
const total = priceResult.value * quantity;

// Option 3: If zero truly is the correct default, document why
// Zero is correct here because unpublished products should show as free in previews
const displayPrice = product.price ?? 0;
```

## Rule Details

This rule warns when:

- `?? 0` is used (nullish coalescing) - may hide undefined/null values
- `|| 0` is used (logical OR) - may hide all falsy values including `0`, `''`, `false`
- `&& 0` is used (logical AND) - always results in either a falsy value or `0`

### Examples

#### Cases that trigger the warning

```typescript
// Nullish coalescing with zero
const count = value ?? 0;
const total = order.amount ?? 0;
const score = user?.stats?.points ?? 0;

// Logical OR with zero (even more problematic - hides all falsy values)
const result = value || 0;
const count = items.length || 0;

// Logical AND with zero (suspicious pattern)
const result = isValid && 0;
```

#### Valid cases (no warning)

```typescript
// Non-zero defaults
const count = value ?? 1;
const name = value ?? "unknown";
const result = value || 1;

// Variable defaults
const count = value ?? defaultCount;

// Other operations with zero
const doubled = value * 0;
const isZero = value === 0;
const sum = value + 0;
```

## When to Suppress

If you've determined that zero is genuinely the correct business default, you can suppress the warning with a comment explaining why:

```typescript
// Zero is correct: missing discount means no discount applied
// eslint-disable-next-line @clipboard-health/no-nullish-coalescing-zero
const discount = coupon?.discountPercent ?? 0;
```

Consider adding a comment that explains the business reasoning, so future developers understand the decision.

## Configuration

This rule is automatically enabled as an error for all `*.ts` and `*.tsx` files when using `@clipboard-health/eslint-config`.

To manually configure, add to your ESLint configuration:

```javascript
{
  "plugins": ["@clipboard-health"],
  "rules": {
    "@clipboard-health/no-nullish-coalescing-zero": "error"
  }
}
```

## Related

- [Nullish coalescing operator (??)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing)
- [TypeScript strict null checks](https://www.typescriptlang.org/tsconfig#strictNullChecks)
