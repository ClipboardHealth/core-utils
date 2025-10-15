// packages/mongo-jobs/README.md

import { backgroundJobs } from "./jobsRegistry";

await backgroundJobs.start(["emails"], {
  maxConcurrency: 10,
});
