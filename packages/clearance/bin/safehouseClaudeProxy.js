#!/usr/bin/env node

import path from "node:path";

import { runCli } from "./runCli.js";

// oxlint-disable-next-line node/no-top-level-await -- CLI entry point, never require()'d
await runCli(path.dirname(import.meta.dirname), "safehouseClaudeProxyCli");
