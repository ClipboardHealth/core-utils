# @clipboard-health/notifications <!-- omit from toc -->

Send notifications through third-party providers.

## Table of contents <!-- omit from toc -->

- [Install](#install)
- [Usage](#usage)
  - [`NotificationsClient`](#notificationsclient)
- [Local development commands](#local-development-commands)

## Install

```bash
npm install @clipboard-health/notifications
```

## Usage

### `NotificationsClient`

<embedex source="packages/notifications/examples/notificationClient.ts">

```ts
import { NotificationClient, type Span } from "@clipboard-health/notifications";
import { isSuccess } from "@clipboard-health/util-ts";

import { IdempotentKnock } from "../src/lib/internal/idempotentKnock";

const logger = {
  info: console.log,
  warn: console.warn,
  error: console.error,
} as const;
const tracer = {
  trace: <T>(_name: string, _options: unknown, fun: (span?: Span | undefined) => T): T => fun(),
};
const client = new NotificationClient({
  provider: new IdempotentKnock({ apiKey: "test-api-key", logger }),
  logger,
  tracer,
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
```

</embedex>

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
