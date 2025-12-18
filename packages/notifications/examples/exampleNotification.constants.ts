// embedex: packages/notifications/examples/usage.md
import { type NotificationData } from "@clipboard-health/notifications";

type ExampleNotificationData = NotificationData<{
  workplaceId: string;
}>;

export type ExampleNotificationDataJob = ExampleNotificationData["Job"];
export type ExampleNotificationDataEnqueue = ExampleNotificationData["Enqueue"];

export type ExampleNotificationDo = ExampleNotificationDataJob & { attempt: number };

export const EXAMPLE_NOTIFICATION_JOB_NAME = "ExampleNotificationJob";
