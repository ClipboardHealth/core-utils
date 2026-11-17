#!/usr/bin/env node

import { runCli } from "../lib/internal/runCli";
import { runLintCeilings } from "./runLintCeilings";

runCli(runLintCeilings);
