import { execFile } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { resolveSafehouseCmuxIntegration } from "./safehouseCmux.ts";

const WRAPPER_PATH = path.join(import.meta.dirname, "..", "safehouse", "safehouse-clearance");
const CLAUDE_PROXY_PATH = path.join(
  import.meta.dirname,
  "..",
  "safehouse",
  "safehouse-claude-proxy",
);
const SAFEHOUSE_DIR = path.join(import.meta.dirname, "..", "safehouse");
const EXPECTED_CMUX_ENV_PASS_FLAG = `--env-pass=${resolveSafehouseCmuxIntegration({
  env: {},
  readFile: () => "",
}).envPass.join(",")}`;

interface StubPaths {
  claudeCustomPathPath: string;
  claudeOutputPath: string;
  nodeArgsPath: string;
  safehouseArgsPath: string;
  shimTracePath: string;
  wrapperStderr: string;
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
): Promise<{ stderr: string; stdout: string }> {
  return await new Promise<{ stderr: string; stdout: string }>((resolve, reject) => {
    execFile(file, [...args], { env }, (error, stdout, stderr) => {
      if (error !== null) {
        reject(new Error("wrapper command failed", { cause: error }));
        return;
      }

      resolve({ stderr, stdout });
    });
  });
}

async function runWrapper(input: { args: readonly string[]; tempDir: string }): Promise<StubPaths> {
  const binDir = path.join(input.tempDir, "bin");
  const claudeCustomPathPath = path.join(input.tempDir, "claude-custom-path.txt");
  const claudeOutputPath = path.join(input.tempDir, "claude-output.txt");
  const nodeArgsPath = path.join(input.tempDir, "node-args.txt");
  const safehouseArgsPath = path.join(input.tempDir, "safehouse-args.txt");
  const shimTracePath = path.join(input.tempDir, "shim-trace.txt");
  writeFileSync(claudeCustomPathPath, "");
  writeFileSync(claudeOutputPath, "");
  writeFileSync(nodeArgsPath, "");
  writeFileSync(safehouseArgsPath, "");
  writeFileSync(shimTracePath, "");
  mkdirSync(binDir, { recursive: true });

  writeExecutable(
    path.join(binDir, "node"),
    ["#!/usr/bin/env bash", String.raw`printf "%s\n" "$@" > "$NODE_ARGS_PATH"`, "exit 0", ""].join(
      "\n",
    ),
  );
  writeExecutable(
    path.join(binDir, "safehouse"),
    [
      "#!/usr/bin/env bash",
      String.raw`printf "%s\n" "$@" > "$SAFEHOUSE_ARGS_PATH"`,
      "exit 0",
      "",
    ].join("\n"),
  );

  const inheritedPath = process.env["PATH"] ?? "";
  const { stderr } = await execFileAsync(WRAPPER_PATH, input.args, {
    NODE_ARGS_PATH: nodeArgsPath,
    PATH: `${binDir}${path.delimiter}${inheritedPath}`,
    SAFEHOUSE_ARGS_PATH: safehouseArgsPath,
  });

  return {
    claudeCustomPathPath,
    claudeOutputPath,
    nodeArgsPath,
    safehouseArgsPath,
    shimTracePath,
    wrapperStderr: stderr,
  };
}

async function runClaudeProxy(input: {
  args: readonly string[];
  env?: NodeJS.ProcessEnv;
  tempDir: string;
}): Promise<StubPaths> {
  const binDir = path.join(input.tempDir, "bin");
  const shimRoot = path.join(input.tempDir, "cmux-cli-shims", "surface-1");
  const realBinDir = path.join(input.tempDir, "real-bin");
  const claudeCustomPathPath = path.join(input.tempDir, "claude-custom-path.txt");
  const claudeOutputPath = path.join(input.tempDir, "claude-output.txt");
  const nodeArgsPath = path.join(input.tempDir, "node-args.txt");
  const safehouseArgsPath = path.join(input.tempDir, "safehouse-args.txt");
  const shimTracePath = path.join(input.tempDir, "shim-trace.txt");
  writeFileSync(claudeCustomPathPath, "");
  writeFileSync(claudeOutputPath, "");
  writeFileSync(nodeArgsPath, "");
  writeFileSync(safehouseArgsPath, "");
  writeFileSync(shimTracePath, "");
  mkdirSync(binDir, { recursive: true });
  mkdirSync(shimRoot, { recursive: true });
  mkdirSync(realBinDir, { recursive: true });

  writeExecutable(
    path.join(binDir, "node"),
    ["#!/usr/bin/env bash", String.raw`printf "%s\n" "$@" > "$NODE_ARGS_PATH"`, "exit 0", ""].join(
      "\n",
    ),
  );
  writeExecutable(
    path.join(binDir, "safehouse"),
    [
      "#!/usr/bin/env bash",
      String.raw`printf "%s\n" "$@" > "$SAFEHOUSE_ARGS_PATH"`,
      'while [ "$#" -gt 0 ]; do',
      '  case "$1" in',
      "    --*) shift ;;",
      "    *) break ;;",
      "  esac",
      "done",
      'exec "$@"',
      "",
    ].join("\n"),
  );
  writeExecutable(
    path.join(shimRoot, "claude"),
    [
      "#!/usr/bin/env bash",
      String.raw`printf "shim\n" >> "$SHIM_TRACE_PATH"`,
      'if [ -z "$CMUX_CUSTOM_CLAUDE_PATH" ]; then',
      '  echo "missing CMUX_CUSTOM_CLAUDE_PATH" >&2',
      "  exit 90",
      "fi",
      'exec "$CMUX_CUSTOM_CLAUDE_PATH" "$@"',
      "",
    ].join("\n"),
  );
  writeExecutable(
    path.join(realBinDir, "claude"),
    [
      "#!/usr/bin/env bash",
      String.raw`printf "%s\n" "$CMUX_CUSTOM_CLAUDE_PATH" > "$CLAUDE_CUSTOM_PATH_PATH"`,
      String.raw`printf "%s\n" "$@" > "$CLAUDE_OUTPUT_PATH"`,
      "",
    ].join("\n"),
  );

  const shouldPutCmuxShimOnPath =
    input.env?.["CMUX_SURFACE_ID"] !== undefined ||
    input.env?.["CMUX_CLAUDE_WRAPPER_SHIM"] !== undefined;
  const childPath = [
    binDir,
    ...(shouldPutCmuxShimOnPath ? [shimRoot] : []),
    realBinDir,
    process.env["PATH"] ?? "",
  ].join(path.delimiter);
  const env = {
    CLAUDE_CUSTOM_PATH_PATH: claudeCustomPathPath,
    CLAUDE_OUTPUT_PATH: claudeOutputPath,
    HOME: process.env["HOME"] ?? input.tempDir,
    NODE_ARGS_PATH: nodeArgsPath,
    PATH: childPath,
    SAFEHOUSE_ARGS_PATH: safehouseArgsPath,
    SHIM_TRACE_PATH: shimTracePath,
    ...input.env,
  };
  const { stderr } = await execFileAsync(CLAUDE_PROXY_PATH, input.args, env);

  return {
    claudeCustomPathPath,
    claudeOutputPath,
    nodeArgsPath,
    safehouseArgsPath,
    shimTracePath,
    wrapperStderr: stderr,
  };
}

describe("safehouse-clearance wrapper", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "clearance-safehouse-wrapper-"));
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
      `${path.join(import.meta.dirname, "..")}/bin/ensure.js`,
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

describe("safehouse-claude-proxy wrapper", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "clearance-safehouse-claude-proxy-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("keeps the cmux claude shim active while pointing it at the real claude binary", async () => {
    const shimRoot = path.join(tempDir, "cmux-cli-shims", "surface-1");
    const paths = await runClaudeProxy({
      args: ["--version"],
      env: {
        CMUX_CLAUDE_WRAPPER_SHIM: path.join(shimRoot, "claude"),
        CMUX_CLAUDE_WRAPPER_SHIM_ROOT: shimRoot,
        CMUX_SOCKET_PATH: path.join(tempDir, "cmux.sock"),
      },
      tempDir,
    });

    expect(readLines(paths.safehouseArgsPath)).toContain(EXPECTED_CMUX_ENV_PASS_FLAG);
    expect(readLines(paths.safehouseArgsPath)).toContain(
      `--add-dirs-ro=/Applications/cmux.app:${process.env["HOME"]}/.local/state/cmux:${tempDir}`,
    );
    expect(readLines(paths.shimTracePath)).toStrictEqual(["shim"]);
    expect(readLines(paths.claudeCustomPathPath)).toStrictEqual([
      path.join(tempDir, "real-bin", "claude"),
    ]);
    expect(readLines(paths.claudeOutputPath)).toStrictEqual([
      "--permission-mode",
      "auto",
      "--version",
    ]);
  });

  it("warns when cmux references unreviewed environment variables", async () => {
    const cmuxBinDir = path.join(tempDir, "cmux-app", "Contents", "Resources", "bin");
    const shimRoot = path.join(tempDir, "cmux-cli-shims", "surface-1");
    const shellVariablePrefix = "$";
    mkdirSync(cmuxBinDir, { recursive: true });
    writeExecutable(path.join(cmuxBinDir, "cmux"), "#!/usr/bin/env bash\nexit 0\n");
    writeExecutable(
      path.join(cmuxBinDir, "cmux-claude-wrapper"),
      [
        "#!/usr/bin/env bash",
        `printf "%s" "${shellVariablePrefix}{CMUX_SOCKET_PATH:-}" >/dev/null`,
        `printf "%s" "${shellVariablePrefix}{CMUX_NEW_REQUIRED_SETTING:-}" >/dev/null`,
        "export CMUX_CLAUDE_PID=$$",
        "",
      ].join("\n"),
    );

    const paths = await runClaudeProxy({
      args: ["--version"],
      env: {
        CMUX_BUNDLED_CLI_PATH: path.join(cmuxBinDir, "cmux"),
        CMUX_CLAUDE_WRAPPER_SHIM: path.join(shimRoot, "claude"),
        CMUX_CLAUDE_WRAPPER_SHIM_ROOT: shimRoot,
        CMUX_SOCKET_PATH: path.join(tempDir, "cmux.sock"),
      },
      tempDir,
    });

    expect(paths.wrapperStderr).toContain(
      "safehouse-claude-proxy: cmux wrapper references unreviewed env vars: CMUX_NEW_REQUIRED_SETTING",
    );
    expect(paths.wrapperStderr).not.toContain("CMUX_SOCKET_PATH");
    expect(paths.wrapperStderr).not.toContain("CMUX_CLAUDE_PID");
    expect(readLines(paths.safehouseArgsPath)).toContain(EXPECTED_CMUX_ENV_PASS_FLAG);
  });

  it("omits cmux Safehouse flags outside cmux", async () => {
    const paths = await runClaudeProxy({ args: ["--version"], tempDir });

    expect(readLines(paths.safehouseArgsPath)).not.toContain(
      expect.stringContaining("CMUX_SOCKET_PATH"),
    );
    expect(readLines(paths.safehouseArgsPath)).not.toContain(
      expect.stringContaining("--add-dirs-ro=/Applications/cmux.app"),
    );
    expect(readLines(paths.claudeOutputPath)).toStrictEqual([
      "--permission-mode",
      "auto",
      "--version",
    ]);
  });
});
