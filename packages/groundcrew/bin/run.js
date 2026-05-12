#!/usr/bin/env node

import { dirname } from "node:path";

import { runCli } from "./runCli.js";

await runCli(dirname(import.meta.dirname), "main");
