# Structured Concurrency

```typescript
// Cancellation propagation
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// All results regardless of failures
const results = await Promise.allSettled(operations);
const succeeded = results.filter((r) => r.status === "fulfilled");
const failed = results.filter((r) => r.status === "rejected");
```
