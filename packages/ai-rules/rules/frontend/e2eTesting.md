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

Before writing an E2E test, evaluate whether a component test would suffice. E2E tests are expensive, slow, and flaky — only use them for what component tests cannot cover.

### Use E2E (Playwright) ONLY when the test requires

- Real browser navigation across multiple routes/pages
- Cross-service integration (backend API + frontend together)
- Authentication flows (login, token refresh, session management)
- Third-party service integration that cannot be mocked at the component level
- Complex multi-step user journeys spanning multiple pages (e.g., onboarding funnels)

### Convert to component test when

- Testing a single page or component's behavior (form validation, conditional rendering, error states)
- Testing data display/formatting from mocked API responses
- Testing user interactions within a single view (clicks, inputs, toggles)
- Testing loading/error/empty states
- Testing feature flag variations on UI rendering
- Testing modal or dialog behavior

### Conversion checklist

When reviewing a new E2E test, ask:

1. Does this test cross page boundaries? If no → component test
2. Does this test require real backend responses? If no → component test with MSW
3. Is this testing a critical user flow (auth, payments, onboarding)? If no → likely a component test
4. Could this same assertion be made with `render()` + `screen.getByRole()`? If yes → component test

## Avoid

- Hard-coded timeouts (`page.waitForTimeout`)
- Testing loading states (non-deterministic)
- Shared data between tests
- CSS/XPath selectors
