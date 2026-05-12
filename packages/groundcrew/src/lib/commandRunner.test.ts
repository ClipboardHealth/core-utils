import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";

import { runCommand, runCommandAsync } from "./commandRunner.js";

const spawnMock = vi.hoisted(() =>
  vi.fn<(command: string, arguments_: readonly string[], options: unknown) => FakeChildProcess>(),
);

// oxlint-disable-next-line jest/no-untyped-mock-factory -- this is a partial Node builtin mock.
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn<typeof execFileSync>(),
  spawn: spawnMock,
}));

const execFileMock = vi.mocked(execFileSync);

describe(runCommand, () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("captures stdout by default with consistent subprocess options", () => {
    execFileMock.mockReturnValue("hello\n");

    const actual = runCommand("printf", ["hello"], { cwd: "/work" });

    expect(actual).toBe("hello");
    expect(execFileMock).toHaveBeenCalledWith("printf", ["hello"], {
      cwd: "/work",
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000,
    });
  });

  it("can preserve captured stdout whitespace", () => {
    execFileMock.mockReturnValue("hello\n");

    const actual = runCommand("printf", ["hello"], { trim: false });

    expect(actual).toBe("hello\n");
  });

  it("uses the caller-provided timeout", () => {
    execFileMock.mockReturnValue("");

    runCommand("codexbar", ["usage"], { timeoutMs: 30_000 });

    expect(execFileMock).toHaveBeenCalledWith(
      "codexbar",
      ["usage"],
      expect.objectContaining({ timeout: 30_000 }),
    );
  });

  it("inherits stdio for interactive commands and returns nothing", () => {
    execFileMock.mockReturnValue("");

    runCommand("sbx", ["run", "groundcrew"], { stdio: "inherit" });

    expect(execFileMock).toHaveBeenCalledWith("sbx", ["run", "groundcrew"], {
      cwd: undefined,
      maxBuffer: 10 * 1024 * 1024,
      stdio: "inherit",
      timeout: 120_000,
    });
  });

  it("throws normalized errors with stderr and the original cause", () => {
    const cause = Object.assign(new Error("Command failed"), {
      signal: "SIGTERM",
      status: 2,
      stderr: Buffer.from("fatal: nope\n"),
      stdout: Buffer.from("ignored\n"),
    });
    execFileMock.mockImplementation(() => {
      throw cause;
    });

    const actual = thrownError(() => {
      runCommand("git", ["fetch", "origin"]);
    });

    expect(actual.message).toContain("Command failed: git fetch origin");
    expect(actual.message).toContain("Exit status: 2");
    expect(actual.message).toContain("Signal: SIGTERM");
    expect(actual.message).toContain("Stderr:\nfatal: nope");
    expect(actual.cause).toBe(cause);
  });

  it("normalizes non-Error thrown values and string stderr", () => {
    const cause = { stderr: "plain stderr\n", stdout: "plain stdout\n" };
    execFileMock.mockImplementation(() => {
      // oxlint-disable-next-line no-throw-literal, typescript/only-throw-error -- runCommand accepts unknown subprocess failures defensively
      throw cause;
    });

    const actual = thrownError(() => {
      runCommand("tool", []);
    });

    expect(actual.message).toContain("Command failed: tool");
    expect(actual.message).toContain("Stderr:\nplain stderr");
    expect(actual.message).toContain("Stdout:\nplain stdout");
    expect(actual.cause).toBe(cause);
  });

  it("omits stderr and stdout sections when the subprocess error has none", () => {
    execFileMock.mockImplementation(() => {
      throw new Error("plain failure");
    });

    const actual = thrownError(() => {
      runCommand("tool", []);
    });

    expect(actual.message).not.toContain("Stderr:");
    expect(actual.message).not.toContain("Stdout:");
  });

  it("ignores subprocess output fields that are not text or buffers", () => {
    const cause = Object.assign(new Error("odd failure"), { stderr: 123, stdout: 456 });
    execFileMock.mockImplementation(() => {
      throw cause;
    });

    const actual = thrownError(() => {
      runCommand("tool", []);
    });

    expect(actual.message).not.toContain("Stderr:");
    expect(actual.message).not.toContain("Stdout:");
  });

  it("ignores status and signal fields with unexpected types", () => {
    const cause = Object.assign(new Error("odd failure"), { signal: 9, status: "2" });
    execFileMock.mockImplementation(() => {
      throw cause;
    });

    const actual = thrownError(() => {
      runCommand("tool", []);
    });

    expect(actual.message).not.toContain("Exit status:");
    expect(actual.message).not.toContain("Signal:");
  });

  it("bounds subprocess output included in thrown errors", () => {
    const stderr = "x".repeat(4010);
    const cause = Object.assign(new Error("too much output"), { stderr });
    execFileMock.mockImplementation(() => {
      throw cause;
    });

    const actual = thrownError(() => {
      runCommand("tool", []);
    });

    expect(actual.message).toContain(`${"x".repeat(4000)}\n... truncated 10 chars`);
  });
});

describe(runCommandAsync, () => {
  let processKillMock: ReturnType<typeof vi.fn<(pid: number, signal?: string | number) => true>>;
  let restoreProcessKill: (() => void) | undefined;

  beforeEach(() => {
    processKillMock = vi.fn<(pid: number, signal?: string | number) => true>(() => true);
    const spy = vi.spyOn(process, "kill").mockImplementation(processKillMock);
    restoreProcessKill = () => {
      spy.mockRestore();
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    restoreProcessKill?.();
  });

  it("captures stdout by default without blocking the Node event loop", async () => {
    const child = makeChildProcess();
    spawnMock.mockReturnValue(child);

    const promise = runCommandAsync("printf", ["hello"], { cwd: "/work" });
    child.stdout.emit("data", Buffer.from("hello\n"));
    child.emit("close", 0, null);

    const actual = await promise;

    expect(actual).toBe("hello");
    expect(spawnMock).toHaveBeenCalledWith("printf", ["hello"], {
      cwd: "/work",
      detached: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
  });

  it("can preserve captured async stdout whitespace", async () => {
    const child = makeChildProcess();
    spawnMock.mockReturnValue(child);

    const promise = runCommandAsync("printf", ["hello"], { trim: false });
    child.stdout.emit("data", Buffer.from("hello\n"));
    child.emit("close", 0, null);

    await expect(promise).resolves.toBe("hello\n");
  });

  it("can run without a timeout and capture string chunks", async () => {
    const child = makeChildProcess();
    spawnMock.mockReturnValue(child);

    const promise = runCommandAsync("tail", ["-f", "log"], { timeoutMs: 0 });
    child.stdout.emit("data", "ready\n");
    child.emit("close", 0, null);

    await expect(promise).resolves.toBe("ready");
  });

  it("inherits stdio for interactive async commands and returns nothing", async () => {
    const child = makeChildProcess();
    spawnMock.mockReturnValue(child);

    const promise = runCommandAsync("sbx", ["run", "groundcrew"], { stdio: "inherit" });
    child.emit("close", 0, null);

    await expect(promise).resolves.toBeUndefined();
    expect(spawnMock).toHaveBeenCalledWith("sbx", ["run", "groundcrew"], {
      cwd: undefined,
      detached: false,
      stdio: "inherit",
    });
  });

  it("kills an abortable command process group with SIGINT", async () => {
    const child = makeChildProcess();
    const controller = new AbortController();
    spawnMock.mockReturnValue(child);

    const promise = runCommandAsync("sleep", ["60"], { signal: controller.signal });
    controller.abort();
    child.emit("close", null, "SIGINT");

    await expect(promise).rejects.toThrow("Signal: SIGINT");
    expect(processKillMock).toHaveBeenCalledWith(-child.pid, "SIGINT");
    expect(spawnMock).toHaveBeenCalledWith(
      "sleep",
      ["60"],
      expect.objectContaining({ detached: true }),
    );
  });

  it("force-kills an abortable command process group when it does not exit", async () => {
    vi.useFakeTimers();
    const child = makeChildProcess();
    const controller = new AbortController();
    spawnMock.mockReturnValue(child);

    const promise = runCommandAsync("sleep", ["60"], { signal: controller.signal });
    controller.abort();
    await vi.advanceTimersByTimeAsync(5000);
    child.emit("close", null, "SIGKILL");

    await expect(promise).rejects.toThrow("Signal: SIGKILL");
    expect(processKillMock).toHaveBeenCalledWith(-child.pid, "SIGINT");
    expect(processKillMock).toHaveBeenCalledWith(-child.pid, "SIGKILL");
    vi.useRealTimers();
  });

  it("kills a timed-out non-abortable command directly with SIGTERM", async () => {
    vi.useFakeTimers();
    const child = makeChildProcess();
    spawnMock.mockReturnValue(child);

    const promise = runCommandAsync("sleep", ["60"], { timeoutMs: 1 });
    await vi.advanceTimersByTimeAsync(1);
    child.emit("close", null, "SIGTERM");

    await expect(promise).rejects.toThrow("Signal: SIGTERM");
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    vi.useRealTimers();
  });

  it("rejects and terminates when captured output exceeds the max buffer", async () => {
    vi.useFakeTimers();
    const child = makeChildProcess();
    spawnMock.mockReturnValue(child);

    const promise = runCommandAsync("tool", []);
    child.stdout.emit("data", Buffer.alloc(10 * 1024 * 1024 + 1));
    child.stdout.emit("data", Buffer.alloc(10 * 1024 * 1024 + 1));
    child.emit("close", null, "SIGTERM");

    await expect(promise).rejects.toThrow("stdout maxBuffer exceeded");
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the first child error when close fires afterward", async () => {
    const child = makeChildProcess();
    spawnMock.mockReturnValue(child);

    const promise = runCommandAsync("tool", []);
    child.emit("error", new Error("spawn failed"));
    child.emit("close", 0, null);

    await expect(promise).rejects.toThrow("spawn failed");
  });

  it("includes captured stderr and stdout when an async command fails", async () => {
    const child = makeChildProcess();
    spawnMock.mockReturnValue(child);

    const promise = runCommandAsync("tool", []);
    child.stdout.emit("data", Buffer.from("partial output\n"));
    child.stderr.emit("data", Buffer.from("bad news\n"));
    child.emit("close", 2, null);

    await expect(promise).rejects.toThrow("Exit status: 2");
    await expect(promise).rejects.toThrow("Stderr:\nbad news");
    await expect(promise).rejects.toThrow("Stdout:\npartial output");
  });

  it("does not spawn when the abort signal has already fired", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(runCommandAsync("sleep", ["60"], { signal: controller.signal })).rejects.toThrow(
      "Signal: SIGINT",
    );

    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("kills the command when the abort signal fires during spawn startup", async () => {
    const child = makeChildProcess();
    const controller = new AbortController();
    spawnMock.mockImplementation(() => {
      controller.abort();
      return child;
    });

    const promise = runCommandAsync("sleep", ["60"], { signal: controller.signal });
    child.emit("close", null, "SIGINT");

    await expect(promise).rejects.toThrow("Signal: SIGINT");
    expect(processKillMock).toHaveBeenCalledWith(-child.pid, "SIGINT");
  });
});

function thrownError(action: () => void): Error {
  try {
    action();
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
    throw new Error("Expected an Error", { cause: error });
  }
  throw new Error("Expected action to throw");
}

interface FakeChildProcess extends EventEmitter {
  kill: ReturnType<typeof vi.fn>;
  pid: number;
  stderr: EventEmitter;
  stdout: EventEmitter;
}

function makeChildProcess(): FakeChildProcess {
  // oxlint-disable-next-line unicorn/prefer-event-target -- ChildProcess uses EventEmitter APIs.
  return Object.assign(new EventEmitter(), {
    kill: vi.fn<(signal?: string | number) => boolean>(),
    pid: 12_345,
    // oxlint-disable-next-line unicorn/prefer-event-target -- ChildProcess streams use EventEmitter APIs.
    stderr: new EventEmitter(),
    // oxlint-disable-next-line unicorn/prefer-event-target -- ChildProcess streams use EventEmitter APIs.
    stdout: new EventEmitter(),
  });
}
