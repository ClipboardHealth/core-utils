import { run } from "./cli.ts";
import { cleanupWorkspaceCli } from "./commands/cleanupWorkspace.ts";
import { doctor } from "./commands/doctor.ts";
import { orchestrate } from "./commands/orchestrator.ts";
import { setupWorkspaceCli } from "./commands/setupWorkspace.ts";
import { spriteCli } from "./commands/spriteSetup.ts";
import {
  captureConsoleError,
  captureConsoleLog,
  type ConsoleCapture,
} from "./testHelpers/consoleCapture.ts";

vi.mock(import("./commands/cleanupWorkspace.ts"), () => ({
  cleanupWorkspaceCli: vi.fn<typeof cleanupWorkspaceCli>(),
}));
vi.mock(import("./commands/doctor.ts"), () => ({
  doctor: vi.fn<typeof doctor>(),
}));
vi.mock(import("./commands/orchestrator.ts"), () => ({
  orchestrate: vi.fn<typeof orchestrate>(),
}));
vi.mock(import("./commands/setupWorkspace.ts"), () => ({
  setupWorkspaceCli: vi.fn<typeof setupWorkspaceCli>(),
}));
vi.mock(import("./commands/spriteSetup.ts"), () => ({
  spriteCli: vi.fn<typeof spriteCli>(),
}));

const orchestrateMock = vi.mocked(orchestrate);
const doctorMock = vi.mocked(doctor);
const setupMock = vi.mocked(setupWorkspaceCli);
const cleanupMock = vi.mocked(cleanupWorkspaceCli);
const spriteMock = vi.mocked(spriteCli);

describe(run, () => {
  let consoleLog: ConsoleCapture;
  let consoleError: ConsoleCapture;

  beforeEach(() => {
    consoleLog = captureConsoleLog();
    consoleError = captureConsoleError();
    process.exitCode = undefined;
    orchestrateMock.mockResolvedValue();
    doctorMock.mockResolvedValue(true);
    setupMock.mockResolvedValue();
    cleanupMock.mockResolvedValue();
    spriteMock.mockResolvedValue();
  });

  afterEach(() => {
    consoleLog.restore();
    consoleError.restore();
    process.exitCode = undefined;
    vi.clearAllMocks();
  });

  it("prints help and exits with code 1 when no subcommand is provided", async () => {
    await run([]);

    expect(consoleLog.calls.length).toBeGreaterThan(0);
    const helpOutput = consoleLog.output();
    expect(helpOutput).toContain("Usage: crew <command>");
    expect(helpOutput).toContain("run");
    expect(helpOutput).not.toContain("sandbox");
    expect(process.exitCode).toBe(1);
  });

  it("prints help on -h without setting exit code", async () => {
    await run(["-h"]);

    expect(consoleLog.calls.length).toBeGreaterThan(0);
    expect(process.exitCode).toBeUndefined();
  });

  it("prints help on --help without setting exit code", async () => {
    await run(["--help"]);

    expect(consoleLog.calls.length).toBeGreaterThan(0);
    expect(process.exitCode).toBeUndefined();
  });

  it("reports unknown subcommands and exits with code 1", async () => {
    await run(["bogus"]);

    expect(consoleError.output()).toContain("Unknown command: bogus");
    expect(process.exitCode).toBe(1);
  });

  it("reports sandbox as an unknown subcommand", async () => {
    await run(["sandbox", "auth", "repo-a"]);

    expect(consoleError.output()).toContain("Unknown command: sandbox");
    expect(process.exitCode).toBe(1);
  });

  it("dispatches `run` (no flags) to a one-shot orchestrator tick", async () => {
    await run(["run"]);

    expect(orchestrateMock).toHaveBeenCalledWith({ watch: false, dryRun: false });
    expect(setupMock).not.toHaveBeenCalled();
  });

  it("dispatches `run --watch` to the orchestrator with watch=true", async () => {
    await run(["run", "--watch"]);

    expect(orchestrateMock).toHaveBeenCalledWith({ watch: true, dryRun: false });
  });

  it("dispatches `run --dry-run` to the orchestrator with dryRun=true", async () => {
    await run(["run", "--dry-run"]);

    expect(orchestrateMock).toHaveBeenCalledWith({ watch: false, dryRun: true });
  });

  it("dispatches `run --watch --dry-run` with both flags forwarded", async () => {
    await run(["run", "--watch", "--dry-run"]);

    expect(orchestrateMock).toHaveBeenCalledWith({ watch: true, dryRun: true });
  });

  it("dispatches `run --ticket <id>` to setupWorkspaceCli", async () => {
    await run(["run", "--ticket", "team-220"]);

    expect(setupMock).toHaveBeenCalledWith("team-220", { dryRun: false });
    expect(orchestrateMock).not.toHaveBeenCalled();
  });

  it("forwards --dry-run to setupWorkspaceCli on the --ticket path", async () => {
    await run(["run", "--ticket", "team-220", "--dry-run"]);

    expect(setupMock).toHaveBeenCalledWith("team-220", { dryRun: true });
    expect(orchestrateMock).not.toHaveBeenCalled();
  });

  it("rejects `run --ticket` combined with --watch", async () => {
    await run(["run", "--watch", "--ticket", "team-220"]);

    expect(consoleError.output()).toContain("--watch and --ticket are mutually exclusive");
    expect(process.exitCode).toBe(1);
    expect(setupMock).not.toHaveBeenCalled();
    expect(orchestrateMock).not.toHaveBeenCalled();
  });

  it("rejects `run --ticket` with no value", async () => {
    await run(["run", "--ticket"]);

    expect(consoleError.output()).toContain("ticket id is required");
    expect(process.exitCode).toBe(1);
    expect(setupMock).not.toHaveBeenCalled();
  });

  it("rejects `run --ticket --dry-run` (flag value missing, dash-prefixed value)", async () => {
    await run(["run", "--ticket", "--dry-run"]);

    expect(consoleError.output()).toContain("ticket id is required");
    expect(process.exitCode).toBe(1);
    expect(setupMock).not.toHaveBeenCalled();
  });

  it("rejects `run --ticket` with an empty-string value", async () => {
    await run(["run", "--ticket", ""]);

    expect(consoleError.output()).toContain("ticket id is required");
    expect(process.exitCode).toBe(1);
    expect(setupMock).not.toHaveBeenCalled();
  });

  it("rejects unknown args under `run` (e.g. --help) instead of swallowing them", async () => {
    await run(["run", "--help"]);

    expect(consoleError.output()).toContain("unknown argument: --help");
    expect(process.exitCode).toBe(1);
    expect(orchestrateMock).not.toHaveBeenCalled();
    expect(setupMock).not.toHaveBeenCalled();
  });

  it("rejects extra positional args after `run --ticket <id>`", async () => {
    await run(["run", "--ticket", "team-220", "extra"]);

    expect(consoleError.output()).toContain("unknown argument: extra");
    expect(process.exitCode).toBe(1);
    expect(setupMock).not.toHaveBeenCalled();
  });

  it("calls doctor and leaves exit code untouched on success", async () => {
    doctorMock.mockResolvedValue(true);

    await run(["doctor"]);

    expect(doctorMock).toHaveBeenCalledWith();
    expect(process.exitCode).toBeUndefined();
  });

  it("sets exit code to 1 when doctor fails", async () => {
    doctorMock.mockResolvedValue(false);

    await run(["doctor"]);

    expect(process.exitCode).toBe(1);
  });

  it("dispatches cleanup to cleanupWorkspaceCli with the remaining argv", async () => {
    await run(["cleanup", "--force", "TEAM-1"]);

    expect(cleanupMock).toHaveBeenCalledWith(["--force", "TEAM-1"]);
  });

  it("dispatches sprite to spriteCli with the remaining argv", async () => {
    await run(["sprite", "setup", "crew-claude-1", "--mcp", "linear"]);

    expect(spriteMock).toHaveBeenCalledWith(["setup", "crew-claude-1", "--mcp", "linear"]);
  });

  it("prints the error message and sets exit code 1 when a subcommand throws", async () => {
    setupMock.mockRejectedValue(new Error("boom"));

    await run(["run", "--ticket", "team-1"]);

    expect(consoleError.output()).toBe("boom");
    expect(process.exitCode).toBe(1);
  });
});
