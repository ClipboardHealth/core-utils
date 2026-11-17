#!/usr/bin/env node

import { runCli } from "../lib/internal/runCli";
import { runCheckSuppressions } from "./runCheckSuppressions";

process.stderr.write(
  "cbh-check-suppressions is deprecated and will be removed; use cb-check-suppressions.\n",
);
runCli(runCheckSuppressions);
