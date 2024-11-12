#!/usr/bin/env node
import { embedder } from "../lib/embedder";
import { parseOptions } from "./parseOptions";

async function cli(): Promise<void> {
  if (process.argv.includes("--help")) {
    printHelp();
  }

  const { check, directory } = parseOptions();

  await embedder({
    check,
    directory,
  }).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

function printHelp(): never {
  console.log(`
example-embedder

Command-line interface (CLI) to embed example TypeScript code into TypeDoc comments and markdown files.

Options:
  --check    Verify embedded examples are up to date without modifying files
  --help     Show this help message

Arguments:
  directory  Directory containing example files (default: "examples")

Usage:
  $ example-embedder [directory]
  $ example-embedder [directory] --check
`);
  process.exit(0);
}

void cli();
