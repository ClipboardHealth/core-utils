import { platform } from "node:process";

import type { RunCommandOptions } from "./commandRunner.js";
import { detectHostCapabilities, which } from "./host.js";

type RunCommandMock = (
  command: string,
  arguments_: readonly string[],
  options?: RunCommandOptions,
) => string;

const runCommandMock = vi.hoisted(() => vi.fn<RunCommandMock>());

vi.mock(import("./commandRunner.js"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    runCommand: runCommandMock,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test mock intentionally shares one recorder across sync and async command APIs.
    runCommandAsync: runCommandMock as unknown as typeof actual.runCommandAsync,
  };
});

function mockWhich(presentBinaries: readonly string[]): void {
  runCommandMock.mockImplementation((_cmd, arguments_) => {
    const [target] =
      Array.isArray(arguments_) && typeof arguments_[0] === "string" ? [arguments_[0]] : [""];
    if (presentBinaries.includes(target)) {
      return `/usr/bin/${target}\n`;
    }
    throw new Error(`not found: ${target}`);
  });
}

describe(detectHostCapabilities, () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reports safehouse, sbx, cmux, and tmux as present when all are on PATH", async () => {
    mockWhich(["safehouse", "sbx", "cmux", "tmux"]);

    const actual = await detectHostCapabilities();

    expect(actual.hasSafehouse).toBe(true);
    expect(actual.hasSbx).toBe(true);
    expect(actual.hasCmux).toBe(true);
    expect(actual.hasTmux).toBe(true);
  });

  it("reports every probed binary as missing when which throws", async () => {
    mockWhich([]);

    const actual = await detectHostCapabilities();

    expect(actual.hasSafehouse).toBe(false);
    expect(actual.hasSbx).toBe(false);
    expect(actual.hasCmux).toBe(false);
    expect(actual.hasTmux).toBe(false);
  });

  it("reports a binary missing when which returns whitespace only", async () => {
    runCommandMock.mockReturnValue("   \n");

    const actual = await detectHostCapabilities();

    expect(actual.hasSafehouse).toBe(false);
  });

  it("flags safehouse support based on the current platform", async () => {
    mockWhich([]);

    const actual = await detectHostCapabilities();

    expect(actual.isSafehouseSupported).toBe(platform === "darwin");
  });

  it("passes an AbortSignal into which probes", async () => {
    const controller = new AbortController();
    runCommandMock.mockReturnValue("/usr/bin/git\n");

    const actual = await which("git", controller.signal);

    expect(actual).toBe("/usr/bin/git");
    expect(runCommandMock).toHaveBeenCalledWith("which", ["git"], { signal: controller.signal });
  });

  it("rethrows which failures when the signal has already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    runCommandMock.mockImplementation(() => {
      throw new Error("interrupted");
    });

    await expect(which("git", controller.signal)).rejects.toThrow("interrupted");
  });
});
