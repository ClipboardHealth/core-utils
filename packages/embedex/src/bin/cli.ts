#!/usr/bin/env node
import { Command, Option } from "@commander-js/extra-typings";

import { name, version } from "../../package.json";
import { embed } from "../lib/embed";
import { processResult } from "./processResult";

const program = new Command()
  .name(name)
  .description(
    "Command-line interface (CLI) to embed example TypeScript code into TypeDoc comments.",
  )
  .version(String(version))
  .addOption(
    new Option("-e, --examples <directory>", "examples directory glob pattern").default(
      "examples/**/*.ts",
    ),
  )
  .addOption(
    new Option("-c, --check", "check if examples are already embedded, useful for CI").default(
      false,
    ),
  )
  .addOption(
    new Option("-d, --dry-run", "show what would be changed without making changes").default(false),
  );

program.parse();

const options = program.opts();
const { check, dryRun, examples } = options;

embed({
  globPattern: examples,
  root: process.cwd(),
  write: !check && !dryRun,
})
  .then((result) => {
    const output = processResult({ check, dryRun, result });
    if (output.isError) {
      console.error(output.message);
      process.exit(1);
    } else {
      console.log(output.message);
    }
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
