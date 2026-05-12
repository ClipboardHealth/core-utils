#!/usr/bin/env node

import { ensureClearance } from "./launcher.js";

ensureClearance({
  logger: (message) => {
    process.stderr.write(`${message}\n`);
  },
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(2);
});
