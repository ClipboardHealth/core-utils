# E2E Testing (Playwright)

## Core Rules

- Test critical user flows only—not exhaustive scenarios; when in doubt, write a component test instead
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

## E2E vs Component Test Decision

Before adding an E2E test:

1. Check if existing E2E tests already cover the API calls and flows being tested — avoid duplicating coverage
2. Confirm the flow is a core user journey (auth, payments, onboarding, multi-page navigation) — non-core flows belong in component tests even if they call backend APIs or touch API contracts
3. Verify the test requires real cross-service integration or multi-page navigation — if it can be asserted with `render()` + `screen.getByRole()` or mocked API responses, write a component test instead

## Avoid

- Hard-coded timeouts (`page.waitForTimeout`)
- Testing loading states (non-deterministic)
- Shared data between tests
- CSS/XPath selectors
