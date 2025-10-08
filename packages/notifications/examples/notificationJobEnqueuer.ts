// packages/notifications/README.md
import { NotificationJobEnqueuer } from "@clipboard-health/notifications";

import { BackgroundJobsService } from "./setup";

// Provide this in your microservice.
export const notificationJobEnqueuer = new NotificationJobEnqueuer({
  adapter: new BackgroundJobsService(),
});
