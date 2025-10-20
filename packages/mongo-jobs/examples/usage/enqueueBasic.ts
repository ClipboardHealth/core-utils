import { backgroundJobs } from "./jobsRegistry";
import { MyJob } from "./myJob";

// Basic enqueue
await backgroundJobs.enqueue(MyJob, {
  userId: "123",
  action: "process",
});
