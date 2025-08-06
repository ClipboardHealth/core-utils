// packages/analytics/README.md
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
