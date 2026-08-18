---
description: "Choosing and writing Playwright E2E tests for registered critical flows"
---

# E2E Testing (Playwright)

## Core Rules

- Keep the E2E suite Pareto-optimal: the smallest set of tests that protects the most critical user and business risk
- Record the mapped critical flow's `id` in the test title or an adjacent comment
- Each test sets up its own data (no shared state between tests)
- Mock feature flags and third-party services
- Use user-centric locators in priority order: `getByRole`, `getByLabel`, `getByPlaceholder`, `getByText`; use `getByTestId` only as a last resort—avoid CSS/XPath selectors

## Assertions

```typescript
// ✅ Assert visibility
await expect(page.getByText("Submit")).toBeVisible();

// ❌ Don't assert DOM attachment
await expect(page.getByText("Submit")).toBeAttached();
```

## E2E Admission Gate

Before adding an E2E test:

1. Identify the exact [`criticalFlows.json`](https://github.com/ClipboardHealth/groundtruth/blob/main/registry/criticalFlows.json) entry for the behavior. A flow absent from the registry belongs at a lower test seam.
2. Identify the distinct browser-to-service failure this test detects beyond existing E2E coverage. Multi-page navigation alone is insufficient.
3. Use the lowest seam that can detect the failure: unit tests for logic and variants, component tests for user-visible behavior, and contract tests for API compatibility.
4. Add the E2E test only when all three checks pass and coverage requires the end-to-end system. Otherwise follow the [frontend testing priority](testing.md#philosophy).

## Avoid

- Hard-coded timeouts (`page.waitForTimeout`)
- Testing loading states (non-deterministic)
- Shared data between tests
