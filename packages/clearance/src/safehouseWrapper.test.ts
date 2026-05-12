import { execFile } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

const WRAPPER_PATH = join(import.meta.dirname, "..", "safehouse", "safehouse-clearance");
const SAFEHOUSE_DIR = join(import.meta.dirname, "..", "safehouse");

interface StubPaths {
  nodeArgsPath: string;
  safehouseArgsPath: string;
}

function writeExecutable(path: string, source: string): void {
  writeFileSync(path, source);
  chmodSync(path, 0o755);
}

function readLines(path: string): string[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.length > 0);
}

async function execFileAsync(
  file: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    execFile(file, [...args], { env }, (error) => {
      if (error !== null) {
        reject(new Error("wrapper command failed", { cause: error }));
        return;
      }

      resolve();
    });
  });
}

async function runWrapper(input: { args: readonly string[]; tempDir: string }): Promise<StubPaths> {
  const binDir = join(input.tempDir, "bin");
  const nodeArgsPath = join(input.tempDir, "node-args.txt");
  const safehouseArgsPath = join(input.tempDir, "safehouse-args.txt");
  writeFileSync(nodeArgsPath, "");
  writeFileSync(safehouseArgsPath, "");
  mkdirSync(binDir, { recursive: true });

  writeExecutable(
    join(binDir, "node"),
    ["#!/usr/bin/env bash", String.raw`printf "%s\n" "$@" > "$NODE_ARGS_PATH"`, "exit 0", ""].join(
      "\n",
    ),
  );
  writeExecutable(
    join(binDir, "safehouse"),
    [
      "#!/usr/bin/env bash",
      String.raw`printf "%s\n" "$@" > "$SAFEHOUSE_ARGS_PATH"`,
      "exit 0",
      "",
    ].join("\n"),
  );

  const inheritedPath = process.env["PATH"] ?? "";
  await execFileAsync(WRAPPER_PATH, input.args, {
    NODE_ARGS_PATH: nodeArgsPath,
    PATH: `${binDir}${delimiter}${inheritedPath}`,
    SAFEHOUSE_ARGS_PATH: safehouseArgsPath,
  });

  return { nodeArgsPath, safehouseArgsPath };
}

describe("safehouse-clearance wrapper", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "clearance-safehouse-wrapper-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("ensures the proxy is running and execs safehouse with env + profile", async () => {
    const paths = await runWrapper({ args: ["codex", "--help"], tempDir });

    expect(readLines(paths.safehouseArgsPath)).toStrictEqual([
      `--env=${SAFEHOUSE_DIR}/clearance.env`,
      `--append-profile=${SAFEHOUSE_DIR}/clearance-only.sb`,
      "codex",
      "--help",
    ]);
    expect(readLines(paths.nodeArgsPath)).toStrictEqual([
      `${join(import.meta.dirname, "..")}/bin/ensure.js`,
    ]);
  });

  it("passes safehouse flags through verbatim ahead of the agent command", async () => {
    const paths = await runWrapper({
      args: ["--enable=cloud-credentials", "--env-pass=AWS_PROFILE", "codex"],
      tempDir,
    });

    expect(readLines(paths.safehouseArgsPath)).toStrictEqual([
      `--env=${SAFEHOUSE_DIR}/clearance.env`,
      `--append-profile=${SAFEHOUSE_DIR}/clearance-only.sb`,
      "--enable=cloud-credentials",
      "--env-pass=AWS_PROFILE",
      "codex",
    ]);
  });
});
