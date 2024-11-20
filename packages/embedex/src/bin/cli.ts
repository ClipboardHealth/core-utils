#!/usr/bin/env node
import { Command, Option } from "@commander-js/extra-typings";

import { description, name, version } from "../../package.json";
import { embed } from "../lib/embed";
import { dim, processResult } from "./processResult";

const program = new Command()
  .name(name)
  .description(description)
  .version(String(version))
  .addOption(
    new Option("-e, --sourcesGlob <pattern>", "sources glob pattern").default(
      "examples/**/*.{md,ts}",
    ),
  )
  .addOption(
    new Option(
      "-c, --check",
      "verify if sources are correctly embedded without making changes, exits with non-zero code if updates are needed; useful for CI/CD pipelines",
    ).default(false),
  )
  .addOption(new Option("-v, --verbose", "show verbose output").default(false));

program.parse();

const options = program.opts();
const { check, sourcesGlob, verbose } = options;
const cwd = process.cwd();

if (verbose) {
  console.log(dim("sourcesGlob:\n  ", sourcesGlob));
  console.log(dim("cwd:\n  ", cwd));
}

embed({
  cwd,
  sourcesGlob,
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
