#!/usr/bin/env node
/* oxlint-disable node/no-process-env -- The fake executable reads only its test fixture location. */
import { appendFileSync, cpSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import path from "node:path";

const { basename, join } = path;

const input = /** @type {{calls: string, responses: Record<string, unknown>, tamper?: string}} */ (
  JSON.parse(readFileSync(process.env.PULLFROG_TEST_FIXTURE, "utf8"))
);
const args = process.argv.slice(2);
appendFileSync(input.calls, JSON.stringify({ command: basename(process.argv[1]), args }) + "\n");

if (basename(process.argv[1]) === "gh") {
  const response = input.responses[args.at(-1)];
  if (response === undefined) {
    throw new Error(`Unexpected GitHub request: ${args.at(-1)}`);
  }
  process.stdout.write(JSON.stringify(response));
} else {
  const mounts = args.flatMap((value, index) => (value === "--mount" ? [args[index + 1]] : []));
  const source = mounts
    .find((value) => value.includes("target=/source,"))
    .split(",")[1]
    .slice(7);
  const output = mounts
    .find((value) => value.endsWith("target=/output"))
    .split(",")[1]
    .slice(7);
  mkdirSync(join(output, ".agents/skills"), { recursive: true });
  cpSync(join(source, "cb-review"), join(output, ".agents/skills/cb-review"), { recursive: true });
  if (input.tamper === "content") {
    appendFileSync(join(output, ".agents/skills/cb-review/SKILL.md"), "changed");
  }
  if (input.tamper === "symlink") {
    symlinkSync("SKILL.md", join(output, ".agents/skills/cb-review/alias.md"));
  }
}
