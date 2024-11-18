#!/usr/bin/env node
import { Command, Option } from "@commander-js/extra-typings";

import { name, version } from "../../package.json";
import { embed } from "../lib/embed";
import { dim, processResult } from "./processResult";

const program = new Command()
  .name(name)
  .description(
    "Command-line interface (CLI) to embed example TypeScript code into TypeDoc comments.",
  )
  .version(String(version))
  .addOption(
    new Option("-e, --examplesGlob <pattern>", "examples glob pattern").default("examples/**/*.ts"),
  )
  .addOption(
    new Option("-c, --check", "check if examples are already embedded, useful for CI").default(
      false,
    ),
  )
  .addOption(new Option("-v, --verbose", "show verbose output").default(false));

program.parse();

const options = program.opts();
const { check, examplesGlob, verbose } = options;
const cwd = process.cwd();

if (verbose) {
  console.log(dim("examplesGlob:\n  ", examplesGlob));
  console.log(dim("cwd:\n  ", cwd));
}

embed({
  examplesGlob,
  cwd,
  write: !check,
})
  .then((result) => {
    const output = processResult({ check, result, cwd, verbose });
    if (output.some((o) => o.isError)) {
      console.error(output.map((o) => o.message).join("\n"));
      process.exit(1);
    } else {
      console.log(output.map((o) => o.message).join("\n"));
    }
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
