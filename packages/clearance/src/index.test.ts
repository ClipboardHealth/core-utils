import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import * as net from "node:net";
import { setTimeout as delay } from "node:timers/promises";

import {
  CLEARANCE_PACKAGE_NAME,
  createClearanceServer,
  resolveClearanceConfig,
  startClearanceFromEnv,
} from "./index.js";

const servers: (http.Server | net.Server)[] = [];

describe("@clipboard-health/clearance", () => {
  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(async (server) => {
        await closeServer(server);
      }),
    );
  });

  it("exports the package name", () => {
    const actual = CLEARANCE_PACKAGE_NAME;

    expect(actual).toBe("@clipboard-health/clearance");
  });

  it("keeps the workspace binary target checked in and executable", async () => {
    await expect(
      access(new URL("../bin/run.js", import.meta.url), fsConstants.X_OK),
    ).resolves.toBeUndefined();
  });

  it("resolves environment config with safe defaults", () => {
    const actual = resolveClearanceConfig({
      CLEARANCE_ALLOW_HOSTS: "agent-safehouse.dev,*.agent-safehouse.dev",
    });

    expect(actual).toStrictEqual({
      allowedHosts: ["agent-safehouse.dev", "*.agent-safehouse.dev"],
      allowedPorts: [443],
      dnsTtlMs: 60_000,
      idleTimeoutMs: 120_000,
      listenHost: "127.0.0.1",
      maxSockets: 1024,
      port: 19_999,
      shouldBlockPrivateIps: true,
    });
  });

  it("resolves custom environment config", () => {
    const actual = resolveClearanceConfig({
      CLEARANCE_ALLOW_HOSTS: "agent-safehouse.dev",
      CLEARANCE_ALLOW_PORTS: "443 8443,443",
      CLEARANCE_ALLOW_PRIVATE_IPS: "1",
      CLEARANCE_DNS_TTL_MS: "0",
      CLEARANCE_IDLE_TIMEOUT_MS: "5000",
      CLEARANCE_LISTEN_HOST: "0.0.0.0",
      CLEARANCE_MAX_SOCKETS: "5",
      CLEARANCE_PORT: "20000",
    });

    expect(actual).toStrictEqual({
      allowedHosts: ["agent-safehouse.dev"],
      allowedPorts: [443, 8443],
      dnsTtlMs: 0,
      idleTimeoutMs: 5000,
      listenHost: "0.0.0.0",
      maxSockets: 5,
      port: 20_000,
      shouldBlockPrivateIps: false,
    });
  });

  it("requires an explicit host allowlist", () => {
    expect(() => resolveClearanceConfig({})).toThrow(
      /Set CLEARANCE_ALLOW_HOSTS or CLEARANCE_ALLOW_HOSTS_FILES/,
    );
  });

  it("rejects invalid numeric environment config", () => {
    expect(() =>
      resolveClearanceConfig({
        CLEARANCE_ALLOW_HOSTS: "agent-safehouse.dev",
        CLEARANCE_PORT: "not-a-number",
      }),
    ).toThrow("CLEARANCE_PORT must be an integer");
  });

  it("rejects out-of-range numeric environment config", () => {
    expect(() =>
      resolveClearanceConfig({
        CLEARANCE_ALLOW_HOSTS: "agent-safehouse.dev",
        CLEARANCE_PORT: "70000",
      }),
    ).toThrow("CLEARANCE_PORT must be between 1 and 65535");
  });

  it("rejects an empty port allowlist", () => {
    expect(() =>
      resolveClearanceConfig({
        CLEARANCE_ALLOW_HOSTS: "agent-safehouse.dev",
        CLEARANCE_ALLOW_PORTS: " ",
      }),
    ).toThrow("CLEARANCE_ALLOW_PORTS must include at least one valid TCP port");
  });

  it("rejects malformed port entries instead of silently dropping them", () => {
    expect(() =>
      resolveClearanceConfig({
        CLEARANCE_ALLOW_HOSTS: "agent-safehouse.dev",
        CLEARANCE_ALLOW_PORTS: "443,abc",
      }),
    ).toThrow("invalid TCP port in CLEARANCE_ALLOW_PORTS: abc");
  });

  it("starts from environment config and logs the active policy", async () => {
    const port = await getUnusedTcpPort();
    const messages: string[] = [];

    const server = await startClearanceFromEnv({
      env: {
        CLEARANCE_ALLOW_HOSTS: "agent-safehouse.dev",
        CLEARANCE_ALLOW_PORTS: "443",
        CLEARANCE_LISTEN_HOST: "127.0.0.1",
        CLEARANCE_PORT: String(port),
      },
      logger: {
        info: (message) => {
          messages.push(message);
        },
      },
    });
    servers.push(server);

    expect(messages).toStrictEqual([
      `clearance listening on http://127.0.0.1:${port}`,
      "allowed hosts: agent-safehouse.dev",
      "allowed ports: 443",
    ]);
  });

  it("starts with default console logging", async () => {
    const port = await getUnusedTcpPort();
    const mockInfo = vi.spyOn(console, "info").mockReturnValue();

    const server = await startClearanceFromEnv({
      env: {
        CLEARANCE_ALLOW_HOSTS: "agent-safehouse.dev",
        CLEARANCE_ALLOW_PORTS: "443",
        CLEARANCE_LISTEN_HOST: "127.0.0.1",
        CLEARANCE_PORT: String(port),
      },
    });
    servers.push(server);

    expect(mockInfo).toHaveBeenCalledWith(`clearance listening on http://127.0.0.1:${port}`);

    mockInfo.mockRestore();
  });

  it("rejects startup when the listen port is already in use", async () => {
    const occupied = net.createServer();
    const occupiedPort = await listen(occupied);

    await expect(
      startClearanceFromEnv({
        env: {
          CLEARANCE_ALLOW_HOSTS: "agent-safehouse.dev",
          CLEARANCE_LISTEN_HOST: "127.0.0.1",
          CLEARANCE_PORT: String(occupiedPort),
        },
        logger: {
          info: noop,
        },
      }),
    ).rejects.toThrow("EADDRINUSE");
  });

  it("rejects server creation without valid host rules", () => {
    expect(() => createClearanceServer({ allowedHosts: ["", "*.127.0.0.1"] })).toThrow(
      "allowedHosts must include at least one valid host rule",
    );
  });

  it("creates a server with default optional settings", () => {
    const server = createClearanceServer({ allowedHosts: ["example.com"] });

    expect(server.maxConnections).toBe(1024);
  });

  it("forwards absolute HTTP proxy requests to allowed hosts", async () => {
    expect.assertions(6);

    const upstream = http.createServer((req, res) => {
      expect(req.method).toBe("GET");
      expect(req.url).toBe("/hello?x=1");
      // eslint-disable-next-line no-use-before-define -- handler fires only after `upstreamPort` is assigned on the next line.
      expect(req.headers.host).toBe(`allowed.test:${upstreamPort}`);
      expect(req.headers["x-remove"]).toBeUndefined();

      res.end("ok");
    });
    const upstreamPort = await listen(upstream);

    const proxy = createClearanceServer({
      allowedHosts: ["allowed.test"],
      allowedPorts: [upstreamPort],
      dnsLookup: async () => [{ address: "127.0.0.1", family: 4 }],
      shouldBlockPrivateIps: false,
    });
    const proxyPort = await listen(proxy);

    const actual = await requestThroughProxy({
      headers: {
        connection: "x-remove",
        "x-remove": "should-not-forward",
      },
      path: `http://allowed.test:${upstreamPort}/hello?x=1`,
      proxyPort,
    });

    expect(actual.statusCode).toBe(200);
    expect(actual.body).toBe("ok");
  });

  it("allows wildcard host rules and reuses cached DNS answers", async () => {
    let dnsLookupCount = 0;
    const upstream = http.createServer((_req, res) => {
      res.end("ok");
    });
    const upstreamPort = await listen(upstream);

    const proxy = createClearanceServer({
      allowedHosts: ["*.allowed.test"],
      allowedPorts: [upstreamPort],
      dnsLookup: async () => {
        dnsLookupCount += 1;
        return [{ address: "127.0.0.1", family: 4 }];
      },
      dnsTtlMs: 60_000,
      shouldBlockPrivateIps: false,
    });
    const proxyPort = await listen(proxy);

    const first = await requestThroughProxy({
      path: `http://api.allowed.test:${upstreamPort}/first`,
      proxyPort,
    });
    const second = await requestThroughProxy({
      path: `http://api.allowed.test:${upstreamPort}/second`,
      proxyPort,
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(dnsLookupCount).toBe(1);
  });

  it("does not cache DNS answers when the TTL is zero", async () => {
    let dnsLookupCount = 0;
    const upstream = http.createServer((_req, res) => {
      res.end("ok");
    });
    const upstreamPort = await listen(upstream);

    const proxy = createClearanceServer({
      allowedHosts: ["allowed.test"],
      allowedPorts: [upstreamPort],
      dnsLookup: async () => {
        dnsLookupCount += 1;
        return [{ address: "127.0.0.1", family: 4 }];
      },
      dnsTtlMs: 0,
      shouldBlockPrivateIps: false,
    });
    const proxyPort = await listen(proxy);

    await requestThroughProxy({
      path: `http://allowed.test:${upstreamPort}/first`,
      proxyPort,
    });
    await requestThroughProxy({
      path: `http://allowed.test:${upstreamPort}/second`,
      proxyPort,
    });

    expect(dnsLookupCount).toBe(2);
  });

  it("evicts expired DNS cache entries", async () => {
    let dnsLookupCount = 0;
    const upstream = http.createServer((_req, res) => {
      res.end("ok");
    });
    const upstreamPort = await listen(upstream);

    const proxy = createClearanceServer({
      allowedHosts: ["allowed.test"],
      allowedPorts: [upstreamPort],
      dnsLookup: async () => {
        dnsLookupCount += 1;
        return [{ address: "127.0.0.1", family: 4 }];
      },
      dnsTtlMs: 1,
      shouldBlockPrivateIps: false,
    });
    const proxyPort = await listen(proxy);

    await requestThroughProxy({
      path: `http://allowed.test:${upstreamPort}/first`,
      proxyPort,
    });
    await delay(5);
    await requestThroughProxy({
      path: `http://allowed.test:${upstreamPort}/second`,
      proxyPort,
    });

    expect(dnsLookupCount).toBe(2);
  });

  it("forwards requests to explicitly allowed direct IP hosts", async () => {
    const upstream = http.createServer((_req, res) => {
      res.end("direct");
    });
    const upstreamPort = await listen(upstream);

    const proxy = createClearanceServer({
      allowedHosts: ["127.0.0.1"],
      allowedPorts: [upstreamPort],
      shouldBlockPrivateIps: false,
    });
    const proxyPort = await listen(proxy);

    const actual = await requestThroughProxy({
      path: `http://127.0.0.1:${upstreamPort}/`,
      proxyPort,
    });

    expect(actual.statusCode).toBe(200);
    expect(actual.body).toBe("direct");
  });

  it("tunnels CONNECT requests to allowed hosts", async () => {
    const upstream = net.createServer((socket) => {
      socket.once("data", (chunk) => {
        socket.end(`echo:${chunk.toString("utf8")}`);
      });
    });
    const upstreamPort = await listen(upstream);

    const proxy = createClearanceServer({
      allowedHosts: ["agent-safehouse.dev"],
      allowedPorts: [upstreamPort],
      dnsLookup: async () => [{ address: "127.0.0.1", family: 4 }],
      shouldBlockPrivateIps: false,
    });
    const proxyPort = await listen(proxy);

    const actual = await connectThroughProxy({
      connectTarget: `agent-safehouse.dev:${upstreamPort}`,
      payload: "ping",
      proxyPort,
    });

    expect(actual).toContain("HTTP/1.1 200 Connection Established");
    expect(actual).toContain("echo:ping");
  });

  it("tunnels CONNECT requests without initial buffered data", async () => {
    const upstream = net.createServer((socket) => {
      socket.end("ready");
    });
    const upstreamPort = await listen(upstream);

    const proxy = createClearanceServer({
      allowedHosts: ["agent-safehouse.dev"],
      allowedPorts: [upstreamPort],
      dnsLookup: async () => [{ address: "127.0.0.1", family: 4 }],
      shouldBlockPrivateIps: false,
    });
    const proxyPort = await listen(proxy);

    const actual = await connectThroughProxy({
      connectTarget: `agent-safehouse.dev:${upstreamPort}`,
      payload: "",
      proxyPort,
    });

    expect(actual).toContain("HTTP/1.1 200 Connection Established");
    expect(actual).toContain("ready");
  });

  it("returns 400 for malformed CONNECT targets", async () => {
    const proxy = createClearanceServer({
      allowedHosts: ["agent-safehouse.dev"],
      allowedPorts: [443],
    });
    const proxyPort = await listen(proxy);

    const missingPort = await connectThroughProxy({
      connectTarget: "agent-safehouse.dev",
      payload: "",
      proxyPort,
    });
    const invalidPort = await connectThroughProxy({
      connectTarget: "agent-safehouse.dev:",
      payload: "",
      proxyPort,
    });
    const nonNumericPort = await connectThroughProxy({
      connectTarget: "agent-safehouse.dev:not-a-port",
      payload: "",
      proxyPort,
    });

    expect(missingPort).toContain("HTTP/1.1 400 Bad Request");
    expect(invalidPort).toContain("HTTP/1.1 400 Bad Request");
    expect(nonNumericPort).toContain("HTTP/1.1 400 Bad Request");
  });

  it("returns 403 for CONNECT requests to denied hosts", async () => {
    const proxy = createClearanceServer({
      allowedHosts: ["agent-safehouse.dev"],
      allowedPorts: [443],
    });
    const proxyPort = await listen(proxy);

    const actual = await connectThroughProxy({
      connectTarget: "denied.test:443",
      payload: "",
      proxyPort,
    });

    expect(actual).toContain("HTTP/1.1 403 Forbidden");
    expect(actual).toContain("host not allowed: denied.test");
  });

  it("returns 403 for invalid CONNECT hosts", async () => {
    const proxy = createClearanceServer({
      allowedHosts: ["agent-safehouse.dev"],
      allowedPorts: [443],
    });
    const proxyPort = await listen(proxy);

    const actual = await connectThroughProxy({
      connectTarget: "bad/host:443",
      payload: "",
      proxyPort,
    });

    expect(actual).toContain("HTTP/1.1 403 Forbidden");
    expect(actual).toContain("empty or invalid host");
  });

  it("returns 403 for ports outside the allowlist", async () => {
    const proxy = createClearanceServer({
      allowedHosts: ["agent-safehouse.dev"],
      allowedPorts: [443],
      dnsLookup: async () => [{ address: "127.0.0.1", family: 4 }],
      shouldBlockPrivateIps: false,
    });
    const proxyPort = await listen(proxy);

    const actual = await requestThroughProxy({
      path: "http://agent-safehouse.dev:80/",
      proxyPort,
    });

    expect(actual.statusCode).toBe(403);
    expect(actual.body).toContain("port not allowed: 80");
  });

  it("returns DNS failures without losing the message", async () => {
    const proxy = createClearanceServer({
      allowedHosts: ["agent-safehouse.dev"],
      allowedPorts: [80],
      dnsLookup: async () => {
        throw new Error("dns failed");
      },
    });
    const proxyPort = await listen(proxy);

    const actual = await requestThroughProxy({
      path: "http://agent-safehouse.dev/",
      proxyPort,
    });

    expect(actual.statusCode).toBe(403);
    expect(actual.body).toContain("dns failed");
  });

  it("blocks direct private IPv4 and IPv6 targets", async () => {
    const ipv4Proxy = createClearanceServer({
      allowedHosts: ["127.0.0.1"],
      allowedPorts: [443],
    });
    const ipv4ProxyPort = await listen(ipv4Proxy);
    const ipv6Proxy = createClearanceServer({
      allowedHosts: ["[::1]"],
      allowedPorts: [443],
    });
    const ipv6ProxyPort = await listen(ipv6Proxy);

    const ipv4 = await requestThroughProxy({
      path: "http://127.0.0.1:443/",
      proxyPort: ipv4ProxyPort,
    });
    const ipv6 = await connectThroughProxy({
      connectTarget: "[::1]:443",
      payload: "",
      proxyPort: ipv6ProxyPort,
    });

    expect(ipv4.statusCode).toBe(403);
    expect(ipv4.body).toContain("private IP blocked: 127.0.0.1");
    expect(ipv6).toContain("private IP blocked: ::1");
  });

  it("returns 502 when a CONNECT upstream is unavailable", async () => {
    const unusedPort = await getUnusedTcpPort();
    const proxy = createClearanceServer({
      allowedHosts: ["localhost"],
      allowedPorts: [unusedPort],
      shouldBlockPrivateIps: false,
    });
    const proxyPort = await listen(proxy);

    const actual = await connectThroughProxy({
      connectTarget: `localhost:${unusedPort}`,
      payload: "",
      proxyPort,
    });

    expect(actual).toContain("HTTP/1.1 502 Bad Gateway");
  });

  it("returns 502 when an HTTP upstream is unavailable", async () => {
    const unusedPort = await getUnusedTcpPort();
    const proxy = createClearanceServer({
      allowedHosts: ["localhost"],
      allowedPorts: [unusedPort],
      shouldBlockPrivateIps: false,
    });
    const proxyPort = await listen(proxy);

    const actual = await requestThroughProxy({
      path: `http://localhost:${unusedPort}/`,
      proxyPort,
    });

    expect(actual.statusCode).toBe(502);
  });

  it("times out stalled HTTP upstream responses", async () => {
    const pendingResponses: http.ServerResponse[] = [];
    const upstream = http.createServer((_req, res) => {
      pendingResponses.push(res);
    });
    const upstreamPort = await listen(upstream);
    const proxy = createClearanceServer({
      allowedHosts: ["localhost"],
      allowedPorts: [upstreamPort],
      idleTimeoutMs: 5,
      shouldBlockPrivateIps: false,
    });
    const proxyPort = await listen(proxy);

    const actual = await requestThroughProxy({
      path: `http://localhost:${upstreamPort}/`,
      proxyPort,
    });

    expect(actual.statusCode).toBe(502);
    expect(actual.body).toContain("upstream timeout");
  });

  it("tears down plain HTTP upstream requests when the client disconnects", async () => {
    let resolveUpstreamRequested = failUnexpectedResolver;
    let resolveUpstreamClosed = failUnexpectedResolver;
    const upstreamRequested = new Promise<void>((resolve) => {
      resolveUpstreamRequested = resolve;
    });
    const upstreamClosed = new Promise<void>((resolve) => {
      resolveUpstreamClosed = resolve;
    });
    const upstream = http.createServer((req, _res) => {
      resolveUpstreamRequested();
      req.once("close", resolveUpstreamClosed);
    });
    const upstreamPort = await listen(upstream);
    const proxy = createClearanceServer({
      allowedHosts: ["localhost"],
      allowedPorts: [upstreamPort],
      shouldBlockPrivateIps: false,
    });
    const proxyPort = await listen(proxy);

    const client = net.createConnection({ host: "127.0.0.1", port: proxyPort });
    await new Promise<void>((resolve, reject) => {
      client.once("connect", () => {
        client.write(
          `GET http://localhost:${upstreamPort}/ HTTP/1.1\r\nHost: localhost:${upstreamPort}\r\n\r\n`,
        );
        resolve();
      });
      client.once("error", reject);
    });
    await upstreamRequested;

    client.destroy();

    await expect(upstreamClosed).resolves.toBeUndefined();
  });

  it("rejects malformed absolute HTTP proxy requests", async () => {
    const proxy = createClearanceServer({
      allowedHosts: ["allowed.test"],
      allowedPorts: [80],
    });
    const proxyPort = await listen(proxy);

    const relative = await requestThroughProxy({ path: "/relative", proxyPort });
    const https = await requestThroughProxy({ path: "https://allowed.test/", proxyPort });

    expect(relative.statusCode).toBe(400);
    expect(relative.body).toContain("HTTP proxy requests must use absolute URLs");
    expect(https.statusCode).toBe(400);
    expect(https.body).toContain("Use CONNECT for HTTPS");
  });

  it("blocks private DNS answers by default", async () => {
    const proxy = createClearanceServer({
      allowedHosts: ["allowed.test"],
      allowedPorts: [80],
      dnsLookup: async () => [{ address: "127.0.0.1", family: 4 }],
    });
    const proxyPort = await listen(proxy);

    const actual = await requestThroughProxy({
      path: "http://allowed.test/",
      proxyPort,
    });

    expect(actual.statusCode).toBe(403);
    expect(actual.body).toContain("no public address for allowed.test");
  });

  it("blocks documentation IPv4 DNS answers by default", async () => {
    const proxy = createClearanceServer({
      allowedHosts: ["allowed.test"],
      allowedPorts: [80],
      dnsLookup: async () => [{ address: "192.0.2.1", family: 4 }],
    });
    const proxyPort = await listen(proxy);

    const actual = await requestThroughProxy({
      path: "http://allowed.test/",
      proxyPort,
    });

    expect(actual.statusCode).toBe(403);
    expect(actual.body).toContain("no public address for allowed.test");
  });

  it("normalizes host rules conservatively", () => {
    const actual = resolveClearanceConfig({
      CLEARANCE_ALLOW_HOSTS:
        "Agent-Safehouse.Dev.,*.Example.com,*.127.0.0.1,bad/host,foo*bar,foo:bar,foo@bar,[example.com],[::1]",
    });

    expect(actual.allowedHosts).toStrictEqual(["agent-safehouse.dev", "*.example.com", "::1"]);
  });

  it("denies hosts outside the allowlist before resolving DNS", async () => {
    let dnsLookupCount = 0;
    const proxy = createClearanceServer({
      allowedHosts: ["allowed.test"],
      allowedPorts: [80],
      dnsLookup: async () => {
        dnsLookupCount += 1;
        return [{ address: "127.0.0.1", family: 4 }];
      },
      shouldBlockPrivateIps: false,
    });
    const proxyPort = await listen(proxy);

    const actual = await requestThroughProxy({
      path: "http://denied.test/",
      proxyPort,
    });

    expect(actual.statusCode).toBe(403);
    expect(actual.body).toContain("host not allowed: denied.test");
    expect(dnsLookupCount).toBe(0);
  });

  it("returns 400 for invalid client bytes", async () => {
    const proxy = createClearanceServer({
      allowedHosts: ["allowed.test"],
      allowedPorts: [80],
    });
    const proxyPort = await listen(proxy);

    const actual = await writeRawToProxy({ payload: "not http\r\n\r\n", proxyPort });

    expect(actual).toContain("HTTP/1.1 400 Bad Request");
  });
});

interface ProxyRequestInput {
  headers?: http.OutgoingHttpHeaders;
  path: string;
  proxyPort: number;
}

interface ProxyResponse {
  body: string;
  statusCode: number | undefined;
}

interface ConnectThroughProxyInput {
  connectTarget: string;
  payload: string;
  proxyPort: number;
}

async function requestThroughProxy(input: ProxyRequestInput): Promise<ProxyResponse> {
  const { headers, path, proxyPort } = input;

  return await new Promise<ProxyResponse>((resolve, reject) => {
    const req = http.request(
      {
        headers,
        host: "127.0.0.1",
        method: "GET",
        path,
        port: proxyPort,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });
        res.on("end", () => {
          resolve({
            body: Buffer.concat(chunks).toString("utf8"),
            statusCode: res.statusCode,
          });
        });
      },
    );

    req.on("error", reject);
    req.end();
  });
}

async function connectThroughProxy(input: ConnectThroughProxyInput): Promise<string> {
  const { connectTarget, payload, proxyPort } = input;

  return await new Promise<string>((resolve, reject) => {
    const client = net.createConnection({ host: "127.0.0.1", port: proxyPort });
    const chunks: Buffer[] = [];

    client.on("connect", () => {
      client.write(`CONNECT ${connectTarget} HTTP/1.1\r\nHost: ${connectTarget}\r\n\r\n${payload}`);
    });
    client.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    client.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    client.on("error", reject);
  });
}

async function writeRawToProxy(input: { payload: string; proxyPort: number }): Promise<string> {
  const { payload, proxyPort } = input;

  return await new Promise<string>((resolve, reject) => {
    const client = net.createConnection({ host: "127.0.0.1", port: proxyPort });
    const chunks: Buffer[] = [];

    client.on("connect", () => {
      client.write(payload);
    });
    client.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    client.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    client.on("error", reject);
  });
}

async function listen(server: http.Server | net.Server): Promise<number> {
  servers.push(server);

  return await listenWithoutTracking(server);
}

async function getUnusedTcpPort(): Promise<number> {
  const server = net.createServer();
  const port = await listenWithoutTracking(server);
  await closeServer(server);

  return port;
}

async function listenWithoutTracking(server: http.Server | net.Server): Promise<number> {
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!isAddressInfo(address)) {
    throw new Error("Expected server to listen on a TCP port");
  }

  return address.port;
}

async function closeServer(server: http.Server | net.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve();
        return;
      }

      reject(error);
    });
  });
}

function isAddressInfo(address: AddressInfo | string | null): address is AddressInfo {
  return typeof address === "object" && address !== null;
}

function noop(): void {
  // Intentionally suppress logs in this test path.
}

function failUnexpectedResolver(): void {
  throw new Error("Promise resolver was called before initialization");
}
