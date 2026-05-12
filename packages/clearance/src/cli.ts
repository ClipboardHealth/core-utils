#!/usr/bin/env node

import { startClearanceFromEnv } from "./index.ts";

startClearanceFromEnv({ env: process.env }).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 2;
});
