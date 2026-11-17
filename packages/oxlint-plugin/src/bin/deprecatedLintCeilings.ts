#!/usr/bin/env node

import { runCli } from "../lib/internal/runCli";
import { runLintCeilings } from "./runLintCeilings";

process.stderr.write(
  "cbh-lint-ceilings is deprecated and will be removed; use cb-lint-ceilings.\n",
);
runCli(runLintCeilings);
