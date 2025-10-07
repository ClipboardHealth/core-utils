// packages/notifications/README.md
import { NotificationTriggerJob } from "@clipboard-health/notifications";

import { BackgroundJobsService } from "./setup";

// Provide this in your microservice, similar to how we have CBHBackgroundJobs in `clipboard-health`
// aka `backend-main`.
export const notificationTriggerJob = new NotificationTriggerJob({
  adapter: new BackgroundJobsService(),
});
