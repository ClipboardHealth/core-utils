#!/usr/bin/env node
import { dirname } from "node:path";

import { runCliEntrypoint } from "./runCli.js";

runCliEntrypoint(dirname(import.meta.dirname), "index");
