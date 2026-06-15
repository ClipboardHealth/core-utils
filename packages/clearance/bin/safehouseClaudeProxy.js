#!/usr/bin/env node

import path from "node:path";

import { runCli } from "./runCli.js";

await runCli(path.dirname(import.meta.dirname), "safehouseClaudeProxyCli");
