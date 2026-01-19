# E2E Testing (Playwright)

## Core Rules

- Test critical user flows only—not exhaustive scenarios
- Each test sets up its own data (no shared state between tests)
- Mock feature flags and third-party services
- Use user-centric locators (role, label, text)—avoid CSS selectors

## Locator Priority

1. `page.getByRole()`
2. `page.getByLabel()`
3. `page.getByPlaceholder()`
4. `page.getByText()`
5. `page.getByTestId()` (last resort)

## Assertions

```typescript
// ✅ Assert visibility
await expect(page.getByText("Submit")).toBeVisible();

// ❌ Don't assert DOM attachment
await expect(page.getByText("Submit")).toBeAttached();
```

## Avoid

- Hard-coded timeouts (`page.waitForTimeout`)
- Testing loading states (non-deterministic)
- Shared data between tests
- CSS/XPath selectors
