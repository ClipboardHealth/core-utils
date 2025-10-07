// packages/notifications/README.md
import { NotificationTriggerJob } from "@clipboard-health/notifications";

import { BackgroundJobsService } from "./setup";

// Provide this in your microservice.
export const notificationTriggerJob = new NotificationTriggerJob({
  adapter: new BackgroundJobsService(),
});
