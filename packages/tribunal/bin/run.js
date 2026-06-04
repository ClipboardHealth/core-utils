#!/usr/bin/env node
import path from "node:path";

import { runCliEntrypoint } from "./runCli.js";

runCliEntrypoint(path.dirname(import.meta.dirname), "index");
