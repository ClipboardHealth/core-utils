# @clipboard-health/analytics <!-- omit from toc -->

Type-safe analytics wrapper around our third-party analytics provider for user identification and event tracking.

## Table of contents <!-- omit from toc -->

- [Install](#install)
- [Usage](#usage)
  - [Basic analytics tracking](#basic-analytics-tracking)
- [Local development commands](#local-development-commands)

## Install

```bash
npm install @clipboard-health/analytics
```

## Usage

### Basic analytics tracking

<embedex source="packages/analytics/examples/analytics.ts">

```ts
import { Analytics } from "@clipboard-health/analytics";

const logger = {
  info: console.log,
  warn: console.warn,
  error: console.error,
};

{
  // Basic usage with both features enabled
  const analytics = new Analytics({
    apiKey: "your-segment-write-key",
    logger,
    enabled: { identify: true, track: true },
  });

  // Identify a user
  analytics.identify({
    userId: "user-123",
    traits: {
      email: "user@example.com",
      name: "John Doe",
      createdAt: new Date("2023-01-01"),
      type: "worker",
    },
  });

  // Track an event
  analytics.track({
    userId: "user-123",
    event: "Button Clicked",
    traits: {
      buttonName: "Apply",
      page: "home",
      plan: "worker",
    },
  });
}

{
  // Disabled analytics example
  const analytics = new Analytics({
    apiKey: "your-segment-write-key",
    logger,
    enabled: { identify: false, track: false },
  });

  // These calls will be logged but not sent to Segment
  analytics.identify({
    userId: "user-789",
    traits: { email: "test@example.com" },
  });

  analytics.track({
    userId: "user-789",
    event: "Page View",
    traits: { page: "home" },
  });
}
```

</embedex>

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
