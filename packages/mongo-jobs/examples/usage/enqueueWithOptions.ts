import type { ClientSession } from "mongodb";

import { backgroundJobs } from "./jobsRegistry";
import { MyJob } from "./myJob";

declare const mongoSession: ClientSession;

// Enqueue with options
await backgroundJobs.enqueue(
  MyJob,
  { userId: "123", action: "process" },
  {
    // Schedule for later
    startAt: new Date("2024-12-31T23:59:59Z"),

    // Ensure uniqueness (see uniqueness section below)
    unique: "user-123-process",

    // Use within a MongoDB transaction
    session: mongoSession,
  },
);
