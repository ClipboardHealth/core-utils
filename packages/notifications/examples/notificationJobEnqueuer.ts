// embedex: packages/notifications/README.md
import { NotificationJobEnqueuer } from "@clipboard-health/notifications";

import { BackgroundJobsService } from "./setup";

// Create and export one instance of this in your microservice.
export const notificationJobEnqueuer = new NotificationJobEnqueuer({
  // Use your instance of `@clipboard-health/mongo-jobs` or `@clipboard-health/background-jobs-postgres` here.
  adapter: new BackgroundJobsService(),
});
