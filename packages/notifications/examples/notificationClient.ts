// packages/notifications/src/lib/notificationClient.ts,packages/notifications/README.md
import { NotificationClient, type Span } from "@clipboard-health/notifications";
import { isSuccess } from "@clipboard-health/util-ts";

const client = new NotificationClient({
  apiKey: "test-api-key",
  logger: {
    info: console.log,
    warn: console.warn,
    error: console.error,
  } as const,
  tracer: {
    trace: <T>(_name: string, _options: unknown, fun: (span?: Span | undefined) => T): T => fun(),
  },
});

async function triggerNotification(job: { attemptsCount: number }) {
  const result = await client.trigger({
    attempt: (job?.attemptsCount ?? 0) + 1,
    body: {
      recipients: ["user-1"],
      data: { favoriteColor: "blue", secret: "2" },
    },
    expiresAt: new Date(Date.now() + 300_000), // 5 minutes
    idempotencyKey: "welcome-user-4",
    key: "welcome-email",
    keysToRedact: ["secret"],
  });

  if (isSuccess(result)) {
    console.log("Notification sent:", result.value.id);
  }
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void triggerNotification({ attemptsCount: 0 });
