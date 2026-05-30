import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  type ClearanceListenerCheck,
  type ClearanceSpawner,
  ensureClearance,
  isClearanceListening,
  spawnClearance,
  type SpawnClearanceInput,
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
      env: { CLEARANCE_ALLOW_HOSTS: "api.example.com", HOME: homeDir, XDG_CACHE_HOME: "" },
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
