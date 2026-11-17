#!/usr/bin/env node

import { runCli } from "../lib/internal/runCli";
import { runCheckSuppressions } from "./runCheckSuppressions";

runCli(runCheckSuppressions);
