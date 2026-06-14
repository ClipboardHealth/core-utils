import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  type ClearanceListenerCheck,
  type ClearanceSpawner,
  ensureClearance,
  isClearanceListening,
  parseClearanceCommand,
  type ProcessKiller,
  restartClearance,
  spawnClearance,
  type SpawnClearanceInput,
  statusClearance,
  stopClearance,
} from "./launcher.ts";

function createTempCacheDir(): string {
  return mkdtempSync(path.join(tmpdir(), "clearance-"));
}

function cleanupCacheDir(cacheDir: string | undefined): void {
  if (cacheDir !== undefined) {
    rmSync(cacheDir, { recursive: true, force: true });
  }
}

function createListenerMock(
  values: readonly boolean[],
): ReturnType<typeof vi.fn<ClearanceListenerCheck>> {
  const mock = vi.fn<ClearanceListenerCheck>();
  for (const value of values) {
    mock.mockResolvedValueOnce(value);
  }
  return mock;
}

function onlySpawnInput(mock: ReturnType<typeof vi.fn<ClearanceSpawner>>): SpawnClearanceInput {
  expect(mock).toHaveBeenCalledTimes(1);
  const input = mock.mock.calls[0]?.[0];
  if (input === undefined) {
    throw new Error("expected spawn input");
  }
  return input;
}

function rememberMessage(messages: string[]): (message: string) => void {
  return (message) => {
    messages.push(message);
  };
}

async function noopAsync(): Promise<void> {
  // Test helper for injected sleeps.
}

function tcpPort(server: net.Server): number {
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected TCP server address");
  }
  return address.port;
}

async function closeServer(server: net.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

describe(ensureClearance, () => {
  let cacheDir: string | undefined;

  afterEach(() => {
    cleanupCacheDir(cacheDir);
    cacheDir = undefined;
  });

  it("reuses an already-listening proxy", async () => {
    const isListeningMock = vi.fn<ClearanceListenerCheck>().mockResolvedValue(true);
    const spawnMock = vi.fn<ClearanceSpawner>();
    const messages: string[] = [];

    const actual = await ensureClearance({
      env: { CLEARANCE_ALLOW_HOSTS: "api.example.com" },
      isListening: isListeningMock,
      logger: rememberMessage(messages),
      spawnDetached: spawnMock,
    });

    expect(actual.status).toBe("already-running");
    expect(actual.port).toBe(19_999);
    expect(spawnMock).not.toHaveBeenCalled();
    expect(messages).toContain("Clearance already listening on http://127.0.0.1:19999");
  });

  it("starts a detached proxy and forwards allowlist env to the child", async () => {
    cacheDir = createTempCacheDir();
    const logPath = path.join(cacheDir, "clearance.log");
    const pidPath = path.join(cacheDir, "clearance.pid");
    const isListeningMock = createListenerMock([false, false, true]);
    const spawnMock = vi.fn<ClearanceSpawner>().mockReturnValue(12_345);
    const sleepMock = vi.fn<() => Promise<void>>().mockResolvedValue();
    const messages: string[] = [];

    const actual = await ensureClearance({
      cacheDir,
      env: { CLEARANCE_ALLOW_HOSTS: "api.example.com" },
      isListening: isListeningMock,
      logger: rememberMessage(messages),
      sleep: sleepMock,
      spawnDetached: spawnMock,
    });

    expect(actual).toStrictEqual({
      logPath,
      pid: 12_345,
      pidPath,
      port: 19_999,
      status: "started",
    });
    const spawnInput = onlySpawnInput(spawnMock);
    expect(spawnInput.args).toContainEqual(
      expect.stringContaining("/packages/clearance/bin/run.js"),
    );
    expect(spawnInput.command).toBe(process.execPath);
    expect(spawnInput.env["CLEARANCE_ALLOW_HOSTS"]).toBe("api.example.com");
    expect(spawnInput.env["CLEARANCE_LISTEN_HOST"]).toBe("127.0.0.1");
    expect(spawnInput.env["CLEARANCE_PORT"]).toBe("19999");
    expect(spawnInput.logPath).toBe(logPath);
    expect(readFileSync(pidPath, "utf8")).toBe("12345\n");
    expect(messages).toContain(
      `Started clearance on http://127.0.0.1:19999 (pid 12345); logs: ${logPath}`,
    );
  });

  it("forwards CLEARANCE_ALLOW_HOSTS_FILES through to the spawned child", async () => {
    cacheDir = createTempCacheDir();
    const hostsFile = path.join(cacheDir, "team");
    writeFileSync(hostsFile, "team.example.com\n");
    const isListeningMock = createListenerMock([false, true]);
    const spawnMock = vi.fn<ClearanceSpawner>().mockReturnValue(67_890);

    await ensureClearance({
      cacheDir,
      env: { CLEARANCE_ALLOW_HOSTS_FILES: hostsFile },
      isListening: isListeningMock,
      sleep: noopAsync,
      spawnDetached: spawnMock,
    });

    const spawnInput = onlySpawnInput(spawnMock);
    expect(spawnInput.env["CLEARANCE_ALLOW_HOSTS_FILES"]).toBe(hostsFile);
  });

  it("applies env overrides on top of clearance's default forwarded env", async () => {
    cacheDir = createTempCacheDir();
    const hostsFile = path.join(cacheDir, "team");
    writeFileSync(hostsFile, "team.example.com\n");
    const isListeningMock = createListenerMock([false, true]);
    const spawnMock = vi.fn<ClearanceSpawner>().mockReturnValue(67_891);
    vi.stubEnv("CLEARANCE_ALLOW_HOSTS", "api.example.com");
    vi.stubEnv("CLEARANCE_ALLOW_HOSTS_FILES", "stale-hosts-file");
    vi.stubEnv("CLEARANCE_ALLOW_PORTS", "443,8443");
    vi.stubEnv("NOT_FORWARDED", "secret");

    try {
      await ensureClearance({
        cacheDir,
        envOverrides: { CLEARANCE_ALLOW_HOSTS_FILES: hostsFile },
        isListening: isListeningMock,
        sleep: noopAsync,
        spawnDetached: spawnMock,
      });

      const spawnInput = onlySpawnInput(spawnMock);
      expect(spawnInput.env["CLEARANCE_ALLOW_HOSTS"]).toBe("api.example.com");
      expect(spawnInput.env["CLEARANCE_ALLOW_HOSTS_FILES"]).toBe(hostsFile);
      expect(spawnInput.env["CLEARANCE_ALLOW_PORTS"]).toBe("443,8443");
      expect(spawnInput.env["NOT_FORWARDED"]).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("uses XDG cache home for the default cache dir", async () => {
    const xdgCacheHome = createTempCacheDir();
    cacheDir = xdgCacheHome;
    const expectedCacheDir = path.join(xdgCacheHome, "clearance");
    const isListeningMock = createListenerMock([false, false, true]);
    const spawnMock = vi.fn<ClearanceSpawner>().mockReturnValue(24_680);

    const actual = await ensureClearance({
      env: {
        CLEARANCE_ALLOW_HOSTS: "api.example.com",
        XDG_CACHE_HOME: xdgCacheHome,
      },
      isListening: isListeningMock,
      pollIntervalMs: 1,
      spawnDetached: spawnMock,
      timeoutMs: 2,
    });

    expect(actual.logPath).toBe(path.join(expectedCacheDir, "clearance.log"));
  });

  it("uses HOME for the default cache dir when XDG cache home is unset", async () => {
    const homeDir = createTempCacheDir();
    cacheDir = homeDir;
    const isListeningMock = createListenerMock([false, true]);
    const spawnMock = vi.fn<ClearanceSpawner>().mockReturnValue(11_223);

    const actual = await ensureClearance({
      env: {
        CLEARANCE_ALLOW_HOSTS: "api.example.com",
        HOME: homeDir,
        XDG_CACHE_HOME: "",
      },
      isListening: isListeningMock,
      sleep: noopAsync,
      spawnDetached: spawnMock,
    });

    expect(actual.pidPath).toBe(path.join(homeDir, ".cache", "clearance", "clearance.pid"));
  });

  it("fails fast when neither CLEARANCE_ALLOW_HOSTS nor _FILES is set", async () => {
    const isListeningMock = vi.fn<ClearanceListenerCheck>().mockResolvedValue(false);
    const spawnMock = vi.fn<ClearanceSpawner>();

    await expect(
      ensureClearance({
        env: {},
        isListening: isListeningMock,
        spawnDetached: spawnMock,
      }),
    ).rejects.toThrow(/Set CLEARANCE_ALLOW_HOSTS or CLEARANCE_ALLOW_HOSTS_FILES/);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("falls back to process.env-derived allowlist env when no env is supplied", async () => {
    const isListeningMock = vi.fn<ClearanceListenerCheck>().mockResolvedValue(false);
    const spawnMock = vi.fn<ClearanceSpawner>();
    vi.stubEnv("CLEARANCE_ALLOW_HOSTS", "");
    vi.stubEnv("CLEARANCE_ALLOW_HOSTS_FILES", "");

    try {
      await expect(
        ensureClearance({
          isListening: isListeningMock,
          spawnDetached: spawnMock,
        }),
      ).rejects.toThrow(/Set CLEARANCE_ALLOW_HOSTS or CLEARANCE_ALLOW_HOSTS_FILES/);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("fails clearly when the spawned proxy does not begin listening", async () => {
    cacheDir = createTempCacheDir();
    const isListeningMock = vi.fn<ClearanceListenerCheck>().mockResolvedValue(false);
    const spawnMock = vi.fn<ClearanceSpawner>().mockReturnValue(13_579);

    await expect(
      ensureClearance({
        cacheDir,
        env: { CLEARANCE_ALLOW_HOSTS: "api.example.com" },
        isListening: isListeningMock,
        pollIntervalMs: 1,
        sleep: noopAsync,
        spawnDetached: spawnMock,
        timeoutMs: 2,
      }),
    ).rejects.toThrow(/Clearance did not start listening on 127\.0\.0\.1:19999/);
  });
});

describe(isClearanceListening, () => {
  it("detects listening and closed TCP ports", async () => {
    const server = net.createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const port = tcpPort(server);

    const open = await isClearanceListening({
      host: "127.0.0.1",
      port,
    });
    await closeServer(server);
    const closed = await isClearanceListening({
      host: "127.0.0.1",
      port,
    });

    expect(open).toBe(true);
    expect(closed).toBe(false);
  });
});

describe(spawnClearance, () => {
  let cacheDir: string | undefined;

  afterEach(() => {
    cleanupCacheDir(cacheDir);
    cacheDir = undefined;
  });

  it("spawns a detached process and returns its pid", () => {
    cacheDir = createTempCacheDir();
    const logPath = path.join(cacheDir, "clearance.log");

    const actual = spawnClearance({
      args: ["-e", ""],
      command: process.execPath,
      env: {},
      logPath,
    });

    expect(actual).toBeGreaterThan(0);
  });
});

function writePidFile(cacheDir: string, pid: number): string {
  const pidPath = path.join(cacheDir, "clearance.pid");
  writeFileSync(pidPath, `${pid}\n`);
  return pidPath;
}

describe(stopClearance, () => {
  let cacheDir: string | undefined;

  afterEach(() => {
    cleanupCacheDir(cacheDir);
    cacheDir = undefined;
  });

  it("kills the pidfile process, removes the pidfile, and reports stopped", async () => {
    cacheDir = createTempCacheDir();
    const pidPath = writePidFile(cacheDir, 12_345);
    const isListeningMock = createListenerMock([false]);
    const killMock = vi.fn<ProcessKiller>();
    const messages: string[] = [];

    const actual = await stopClearance({
      cacheDir,
      isListening: isListeningMock,
      kill: killMock,
      logger: rememberMessage(messages),
    });

    expect(actual).toStrictEqual({ pid: 12_345, port: 19_999, status: "stopped" });
    expect(killMock).toHaveBeenCalledWith({ pid: 12_345 });
    expect(existsSync(pidPath)).toBe(false);
    expect(messages).toContain("Stopped clearance (pid 12345)");
  });

  it("reports not-running when no pidfile exists, deriving the cache dir from env", async () => {
    cacheDir = createTempCacheDir();
    const isListeningMock = vi.fn<ClearanceListenerCheck>();
    const killMock = vi.fn<ProcessKiller>();

    const actual = await stopClearance({
      env: { XDG_CACHE_HOME: cacheDir },
      isListening: isListeningMock,
      kill: killMock,
    });

    expect(actual.status).toBe("not-running");
    expect(killMock).not.toHaveBeenCalled();
  });

  it("treats a garbage pidfile as not running", async () => {
    cacheDir = createTempCacheDir();
    writeFileSync(path.join(cacheDir, "clearance.pid"), "not-a-pid\n");
    const isListeningMock = vi.fn<ClearanceListenerCheck>();
    const killMock = vi.fn<ProcessKiller>();

    const actual = await stopClearance({
      cacheDir,
      isListening: isListeningMock,
      kill: killMock,
    });

    expect(actual.status).toBe("not-running");
    expect(killMock).not.toHaveBeenCalled();
  });

  it("removes a stale pidfile when the process is already gone", async () => {
    cacheDir = createTempCacheDir();
    const pidPath = writePidFile(cacheDir, 999_999);
    const isListeningMock = vi.fn<ClearanceListenerCheck>();
    const killMock = vi.fn<ProcessKiller>().mockImplementation(() => {
      const error: NodeJS.ErrnoException = new Error("no such process");
      error.code = "ESRCH";
      throw error;
    });

    const actual = await stopClearance({
      cacheDir,
      isListening: isListeningMock,
      kill: killMock,
      sleep: noopAsync,
    });

    expect(actual.status).toBe("not-running");
    expect(existsSync(pidPath)).toBe(false);
    expect(isListeningMock).not.toHaveBeenCalled();
  });

  it("rethrows kill errors that are not 'already gone'", async () => {
    cacheDir = createTempCacheDir();
    writePidFile(cacheDir, 12_345);
    const isListeningMock = vi.fn<ClearanceListenerCheck>();
    const killMock = vi.fn<ProcessKiller>().mockImplementation(() => {
      const error: NodeJS.ErrnoException = new Error("operation not permitted");
      error.code = "EPERM";
      throw error;
    });

    await expect(
      stopClearance({
        cacheDir,
        isListening: isListeningMock,
        kill: killMock,
        sleep: noopAsync,
      }),
    ).rejects.toThrow(/operation not permitted/);
    expect(isListeningMock).not.toHaveBeenCalled();
  });

  it("rethrows non-ENOENT pidfile read failures", async () => {
    cacheDir = createTempCacheDir();
    mkdirSync(path.join(cacheDir, "clearance.pid"));
    const isListeningMock = vi.fn<ClearanceListenerCheck>();
    const killMock = vi.fn<ProcessKiller>();

    await expect(
      stopClearance({ cacheDir, isListening: isListeningMock, kill: killMock }),
    ).rejects.toThrow(/EISDIR/);
    expect(killMock).not.toHaveBeenCalled();
  });

  it("rejects a non-positive poll interval", async () => {
    cacheDir = createTempCacheDir();
    writePidFile(cacheDir, 12_345);
    const isListeningMock = vi.fn<ClearanceListenerCheck>().mockResolvedValue(false);
    const killMock = vi.fn<ProcessKiller>();

    await expect(
      stopClearance({
        cacheDir,
        isListening: isListeningMock,
        kill: killMock,
        pollIntervalMs: 0,
      }),
    ).rejects.toThrow(/pollIntervalMs must be a positive number/);
  });

  it("throws when the process refuses to stop within the timeout", async () => {
    cacheDir = createTempCacheDir();
    writePidFile(cacheDir, 12_345);
    const isListeningMock = vi.fn<ClearanceListenerCheck>().mockResolvedValue(true);
    const killMock = vi.fn<ProcessKiller>();

    await expect(
      stopClearance({
        cacheDir,
        isListening: isListeningMock,
        kill: killMock,
        pollIntervalMs: 1,
        sleep: noopAsync,
        timeoutMs: 2,
      }),
    ).rejects.toThrow(/did not stop/);
  });
});

describe(statusClearance, () => {
  let cacheDir: string | undefined;

  afterEach(() => {
    cleanupCacheDir(cacheDir);
    cacheDir = undefined;
  });

  it("reports a running proxy with its pid", async () => {
    cacheDir = createTempCacheDir();
    writePidFile(cacheDir, 54_321);
    const isListeningMock = vi.fn<ClearanceListenerCheck>().mockResolvedValue(true);
    const messages: string[] = [];

    const actual = await statusClearance({
      cacheDir,
      env: { XDG_CACHE_HOME: cacheDir },
      isListening: isListeningMock,
      logger: rememberMessage(messages),
    });

    expect(actual).toStrictEqual({ pid: 54_321, port: 19_999, status: "running" });
    expect(messages).toContain("Clearance is running (pid 54321) on http://127.0.0.1:19999");
  });

  it("reports a running proxy even when no pidfile is present", async () => {
    cacheDir = createTempCacheDir();
    const isListeningMock = vi.fn<ClearanceListenerCheck>().mockResolvedValue(true);
    const messages: string[] = [];

    const actual = await statusClearance({
      cacheDir,
      isListening: isListeningMock,
      logger: rememberMessage(messages),
    });

    expect(actual).toStrictEqual({ port: 19_999, status: "running" });
    expect(messages).toContain("Clearance is running on http://127.0.0.1:19999");
  });

  it("reports not-running when nothing is listening, deriving the cache dir from env", async () => {
    cacheDir = createTempCacheDir();
    const isListeningMock = vi.fn<ClearanceListenerCheck>().mockResolvedValue(false);

    const actual = await statusClearance({
      env: { XDG_CACHE_HOME: cacheDir },
      isListening: isListeningMock,
    });

    expect(actual.status).toBe("not-running");
    expect(actual.pid).toBeUndefined();
  });
});

describe(restartClearance, () => {
  let cacheDir: string | undefined;

  afterEach(() => {
    cleanupCacheDir(cacheDir);
    cacheDir = undefined;
  });

  it("stops the existing proxy and starts a fresh one", async () => {
    cacheDir = createTempCacheDir();
    const pidPath = writePidFile(cacheDir, 111);
    const isListeningMock = createListenerMock([false, false, true]);
    const killMock = vi.fn<ProcessKiller>();
    const spawnMock = vi.fn<ClearanceSpawner>().mockReturnValue(222);

    const actual = await restartClearance({
      cacheDir,
      env: { CLEARANCE_ALLOW_HOSTS: "api.example.com" },
      isListening: isListeningMock,
      kill: killMock,
      sleep: noopAsync,
      spawnDetached: spawnMock,
    });

    expect(killMock).toHaveBeenCalledWith({ pid: 111 });
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(actual.status).toBe("started");
    expect(actual.pid).toBe(222);
    expect(readFileSync(pidPath, "utf8")).toBe("222\n");
  });
});

describe(parseClearanceCommand, () => {
  it("defaults to start when no command is given", () => {
    expect(parseClearanceCommand([])).toBe("start");
  });

  it("returns the recognized command", () => {
    expect(parseClearanceCommand(["stop"])).toBe("stop");
    expect(parseClearanceCommand(["restart"])).toBe("restart");
    expect(parseClearanceCommand(["status"])).toBe("status");
    expect(parseClearanceCommand(["start"])).toBe("start");
  });

  it("throws on an unknown command", () => {
    expect(() => parseClearanceCommand(["bogus"])).toThrow(/Unknown clearance-ensure command/);
  });
});
