import { Buffer } from "node:buffer";
import type { LookupAddress } from "node:dns";
import * as dns from "node:dns/promises";
import * as http from "node:http";
import * as net from "node:net";
import type { Duplex } from "node:stream";

import { resolveAllowlist } from "./allowlist.ts";
import { normalizeHost, normalizeRules, parseList } from "./hostRule.ts";

export { resolveAllowlist, type ResolveAllowlistInput } from "./allowlist.ts";
export {
  type ClearanceCheckInput,
  type ClearanceListenerCheck,
  type ClearanceSpawner,
  ensureClearance,
  type EnsureClearanceInput,
  type EnsureClearanceResult,
  isClearanceListening,
  spawnClearance,
  type SpawnClearanceInput,
} from "./launcher.ts";

export const CLEARANCE_PACKAGE_NAME = "@clipboard-health/clearance";

export interface ClearanceConfig {
  allowedHosts: readonly string[];
  allowedPorts: readonly number[];
  dnsTtlMs: number;
  idleTimeoutMs: number;
  listenHost: string;
  maxSockets: number;
  port: number;
  shouldBlockPrivateIps: boolean;
}

export interface ClearanceLogger {
  info: (message: string) => void;
}

export type DnsLookup = (hostname: string) => Promise<readonly LookupAddress[]>;

export interface CreateClearanceServerOptions {
  allowedHosts: readonly string[];
  allowedPorts?: readonly number[];
  dnsLookup?: DnsLookup;
  dnsTtlMs?: number;
  idleTimeoutMs?: number;
  logger?: ClearanceLogger;
  maxSockets?: number;
  shouldBlockPrivateIps?: boolean;
}

export interface StartClearanceFromEnvInput {
  env: NodeJS.ProcessEnv;
  logger?: ClearanceLogger;
}

interface ResolvedLookupAddress {
  address: string;
  family: 4 | 6;
}

interface DnsCacheEntry {
  records: readonly ResolvedLookupAddress[];
  until: number;
}

interface ProxyState {
  allowedHosts: readonly string[];
  allowedPorts: ReadonlySet<number>;
  dnsCache: Map<string, DnsCacheEntry>;
  dnsLookup: DnsLookup;
  dnsTtlMs: number;
  httpAgent: http.Agent;
  idleTimeoutMs: number;
  logger: ClearanceLogger;
  maxSockets: number;
  shouldBlockPrivateIps: boolean;
}

interface Target {
  address: string;
  family: 4 | 6;
  hostname: string;
  port: number;
}

interface ParsedConnectTarget {
  host: string;
  port: number;
}

interface HttpRequestInput {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  state: ProxyState;
}

interface ConnectInput {
  clientSocket: net.Socket;
  head: Buffer;
  req: http.IncomingMessage;
  state: ProxyState;
}

interface AuthorizeInput {
  host: string;
  port: number;
  state: ProxyState;
}

interface ResolveHostInput {
  hostname: string;
  state: ProxyState;
}

interface DecisionLogInput {
  address?: string;
  decision: "ALLOW" | "DENY";
  hostname: string;
  method: string;
  port: number;
  reason?: string;
}

const DEFAULT_LISTEN_HOST = "127.0.0.1";
const DEFAULT_PORT = 19_999;
const DEFAULT_ALLOWED_PORTS = [443] as const;
const DEFAULT_DNS_TTL_MS = 60_000;
const DEFAULT_IDLE_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_SOCKETS = 1024;
const SERVER_HEADERS_TIMEOUT_MS = 15_000;
const SERVER_KEEP_ALIVE_TIMEOUT_MS = 5000;

const NOOP_LOGGER: ClearanceLogger = {
  info: noop,
};

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const PRIVATE_IPV4_RANGES = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const;

const PRIVATE_IPV6_RANGES = [
  ["::", 128],
  ["::1", 128],
  ["::", 96],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const;

const PRIVATE_IPV4_BLOCK_LIST = createIpBlockList(PRIVATE_IPV4_RANGES, "ipv4");
const PRIVATE_IPV6_BLOCK_LIST = createIpBlockList(PRIVATE_IPV6_RANGES, "ipv6");

export function resolveClearanceConfig(env: NodeJS.ProcessEnv): ClearanceConfig {
  const allowedHosts = resolveAllowlist({ env });

  return {
    allowedHosts,
    allowedPorts: normalizeAllowedPorts(
      parseList(env["CLEARANCE_ALLOW_PORTS"] ?? DEFAULT_ALLOWED_PORTS.join(",")),
    ),
    dnsTtlMs: parseIntegerEnv(
      env,
      "CLEARANCE_DNS_TTL_MS",
      DEFAULT_DNS_TTL_MS,
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    idleTimeoutMs: parseIntegerEnv(
      env,
      "CLEARANCE_IDLE_TIMEOUT_MS",
      DEFAULT_IDLE_TIMEOUT_MS,
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    listenHost: env["CLEARANCE_LISTEN_HOST"] ?? DEFAULT_LISTEN_HOST,
    maxSockets: parseIntegerEnv(
      env,
      "CLEARANCE_MAX_SOCKETS",
      DEFAULT_MAX_SOCKETS,
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    port: parseIntegerEnv(env, "CLEARANCE_PORT", DEFAULT_PORT, 1, 65_535),
    shouldBlockPrivateIps: env["CLEARANCE_ALLOW_PRIVATE_IPS"] !== "1",
  };
}

export function createClearanceServer(options: CreateClearanceServerOptions): http.Server {
  const state = createProxyState(options);
  const server = http.createServer((req, res) => {
    void handleHttpRequest({ req, res, state });
  });

  server.on("connect", (req, clientSocket, head) => {
    /* v8 ignore next @preserve */
    if (!isNetSocket(clientSocket)) {
      socketReply(clientSocket, 400, "Bad Request", "Bad CONNECT socket\n");
      return;
    }

    void handleConnect({ clientSocket, head, req, state });
  });

  server.on("clientError", (_error, socket) => {
    socketReply(socket, 400, "Bad Request", "Bad Request\n");
  });

  server.headersTimeout = SERVER_HEADERS_TIMEOUT_MS;
  server.keepAliveTimeout = SERVER_KEEP_ALIVE_TIMEOUT_MS;
  server.maxConnections = state.maxSockets;
  server.once("close", () => {
    state.httpAgent.destroy();
  });

  return server;
}

export async function startClearanceFromEnv(
  input: StartClearanceFromEnvInput,
): Promise<http.Server> {
  const { env } = input;
  const logger = input.logger ?? console;
  const config = resolveClearanceConfig(env);
  const server = createClearanceServer({
    allowedHosts: config.allowedHosts,
    allowedPorts: config.allowedPorts,
    dnsTtlMs: config.dnsTtlMs,
    idleTimeoutMs: config.idleTimeoutMs,
    logger,
    maxSockets: config.maxSockets,
    shouldBlockPrivateIps: config.shouldBlockPrivateIps,
  });

  await listen(server, config);

  logger.info(`clearance listening on http://${config.listenHost}:${config.port}`);
  logger.info(`allowed hosts: ${config.allowedHosts.join(", ")}`);
  logger.info(`allowed ports: ${config.allowedPorts.join(",")}`);

  return server;
}

function createProxyState(options: CreateClearanceServerOptions): ProxyState {
  const allowedHosts = normalizeRules(options.allowedHosts);
  if (allowedHosts.length === 0) {
    throw new Error("allowedHosts must include at least one valid host rule");
  }

  const maxSockets = options.maxSockets ?? DEFAULT_MAX_SOCKETS;

  return {
    allowedHosts,
    allowedPorts: new Set(normalizeAllowedPorts(options.allowedPorts ?? DEFAULT_ALLOWED_PORTS)),
    dnsCache: new Map(),
    dnsLookup: options.dnsLookup ?? defaultDnsLookup,
    dnsTtlMs: options.dnsTtlMs ?? DEFAULT_DNS_TTL_MS,
    httpAgent: new http.Agent({ keepAlive: true, maxSockets }),
    idleTimeoutMs: options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
    logger: options.logger ?? NOOP_LOGGER,
    maxSockets,
    shouldBlockPrivateIps: options.shouldBlockPrivateIps ?? true,
  };
}

async function listen(server: http.Server, config: ClearanceConfig): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    function onError(error: Error): void {
      server.off("listening", onListening);
      reject(error);
    }

    function onListening(): void {
      server.off("error", onError);
      resolve();
    }

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(config.port, config.listenHost);
  });
}

async function handleConnect(input: ConnectInput): Promise<void> {
  const { clientSocket, head, req, state } = input;
  /* v8 ignore next @preserve */
  clientSocket.on("error", noop);
  /* v8 ignore next @preserve */
  clientSocket.setTimeout(state.idleTimeoutMs, () => {
    clientSocket.destroy(new Error("idle timeout"));
  });

  const parsed = parseConnectTarget(String(req.url));
  if (parsed === undefined) {
    socketReply(clientSocket, 400, "Bad Request", "Bad CONNECT target\n");
    return;
  }

  let target: Target;
  try {
    target = await authorize({ host: parsed.host, port: parsed.port, state });
  } catch (error) {
    const reason = errorMessage(error);
    logDecision(state.logger, {
      decision: "DENY",
      hostname: parsed.host,
      method: "CONNECT",
      port: parsed.port,
      reason,
    });
    socketReply(clientSocket, 403, "Forbidden", `${reason}\n`);
    return;
  }

  let isEstablished = false;
  const upstream = net.createConnection({
    family: target.family,
    host: target.address,
    port: target.port,
  });

  upstream.setNoDelay(true);
  /* v8 ignore next @preserve */
  upstream.setTimeout(state.idleTimeoutMs, () => {
    upstream.destroy(new Error("idle timeout"));
  });

  upstream.once("connect", () => {
    isEstablished = true;
    logDecision(state.logger, {
      address: target.address,
      decision: "ALLOW",
      hostname: target.hostname,
      method: "CONNECT",
      port: target.port,
    });
    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head.length > 0) {
      upstream.write(head);
    }
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });

  upstream.once("error", (error) => {
    /* v8 ignore else @preserve */
    if (!isEstablished) {
      socketReply(clientSocket, 502, "Bad Gateway", `${error.message}\n`);
      return;
    }

    /* v8 ignore next @preserve */
    clientSocket.destroy(error);
  });

  clientSocket.once("close", () => {
    upstream.destroy();
  });
}

async function handleHttpRequest(input: HttpRequestInput): Promise<void> {
  const { req, res, state } = input;
  const rawUrl = String(req.url);

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    httpReply(res, 400, "HTTP proxy requests must use absolute URLs\n");
    return;
  }

  if (url.protocol !== "http:") {
    httpReply(res, 400, "Use CONNECT for HTTPS\n");
    return;
  }

  const port = url.port.length > 0 ? Number(url.port) : 80;
  const method = String(req.method);

  let target: Target;
  try {
    target = await authorize({ host: url.hostname, port, state });
  } catch (error) {
    const reason = errorMessage(error);
    logDecision(state.logger, {
      decision: "DENY",
      hostname: url.hostname,
      method,
      port,
      reason,
    });
    httpReply(res, 403, `${reason}\n`);
    return;
  }

  const headers = stripHopByHopHeaders(req.headers);
  headers.host = url.host;

  const upstreamReq = http.request(
    {
      agent: state.httpAgent,
      family: target.family,
      headers,
      hostname: target.address,
      method: req.method,
      path: `${url.pathname}${url.search}`,
      port: target.port,
    },
    (upstreamRes) => {
      logDecision(state.logger, {
        address: target.address,
        decision: "ALLOW",
        hostname: target.hostname,
        method,
        port: target.port,
      });
      /* v8 ignore next @preserve */
      const statusCode = upstreamRes.statusCode ?? 502;
      res.writeHead(statusCode, stripHopByHopHeaders(upstreamRes.headers));
      upstreamRes.pipe(res);
    },
  );

  upstreamReq.setTimeout(state.idleTimeoutMs, () => {
    upstreamReq.destroy(new Error("upstream timeout"));
  });
  /* v8 ignore next @preserve */
  req.socket.setTimeout(state.idleTimeoutMs, () => {
    upstreamReq.destroy(new Error("client idle timeout"));
  });
  req.once("end", () => {
    req.socket.setTimeout(0);
  });

  upstreamReq.on("error", (error) => {
    /* v8 ignore next @preserve */
    if (res.headersSent) {
      res.destroy(error);
      return;
    }

    httpReply(res, 502, `${error.message}\n`);
  });
  upstreamReq.once("close", () => {
    req.socket.setTimeout(0);
  });
  /* v8 ignore next @preserve */
  req.once("aborted", () => {
    upstreamReq.destroy(new Error("client aborted"));
  });
  res.once("close", () => {
    if (!res.writableEnded) {
      upstreamReq.destroy(new Error("client disconnected"));
    }
  });

  req.pipe(upstreamReq);
}

async function authorize(input: AuthorizeInput): Promise<Target> {
  const { host, port, state } = input;
  const hostname = normalizeHost(host);

  if (hostname === undefined) {
    throw new Error("empty or invalid host");
  }
  if (!state.allowedPorts.has(port)) {
    throw new Error(`port not allowed: ${port}`);
  }
  if (!hostAllowed(hostname, state.allowedHosts)) {
    throw new Error(`host not allowed: ${hostname}`);
  }

  const resolved = await resolveHost({ hostname, state });
  return { address: resolved.address, family: resolved.family, hostname, port };
}

async function resolveHost(input: ResolveHostInput): Promise<ResolvedLookupAddress> {
  const { hostname, state } = input;
  const directIpFamily = net.isIP(hostname);

  if (isIpFamily(directIpFamily)) {
    if (state.shouldBlockPrivateIps && isPrivateIpAddress(hostname, directIpFamily)) {
      throw new Error(`private IP blocked: ${hostname}`);
    }

    return { address: hostname, family: directIpFamily };
  }

  const now = Date.now();
  const cached = state.dnsCache.get(hostname);
  const cachedRecord = cached?.records[0];
  if (cached !== undefined && cached.until > now && cachedRecord !== undefined) {
    return cachedRecord;
  }
  if (cached !== undefined && cached.until <= now) {
    state.dnsCache.delete(hostname);
  }

  const lookupRecords = await state.dnsLookup(hostname);
  const records = lookupRecords
    .filter(hasIpFamily)
    .filter(
      (record) =>
        !(state.shouldBlockPrivateIps && isPrivateIpAddress(record.address, record.family)),
    )
    .toSorted((a, b) => a.family - b.family);
  const [firstRecord] = records;

  if (firstRecord === undefined) {
    throw new Error(`no public address for ${hostname}`);
  }

  if (state.dnsTtlMs > 0) {
    state.dnsCache.set(hostname, { records, until: now + state.dnsTtlMs });
  }
  return firstRecord;
}

async function defaultDnsLookup(hostname: string): Promise<readonly LookupAddress[]> {
  return await dns.lookup(hostname, { all: true, verbatim: false });
}

function hostAllowed(hostname: string, allowedHosts: readonly string[]): boolean {
  return allowedHosts.some((rule) => {
    if (rule.startsWith("*.")) {
      const suffix = rule.slice(1);
      return hostname.endsWith(suffix) && hostname.length > suffix.length;
    }

    return hostname === rule;
  });
}

function parseConnectTarget(input: string): ParsedConnectTarget | undefined {
  const ipv6 = /^\[(?<host>[^\]]+)]:(?<port>\d+)$/.exec(input);
  if (ipv6 !== null) {
    const { host, port: rawPort } = ipv6.groups!;
    const port = parsePort(rawPort);
    /* v8 ignore next @preserve */
    if (host === undefined || port === undefined) {
      return undefined;
    }

    return { host, port };
  }

  const separatorIndex = input.lastIndexOf(":");
  if (separatorIndex <= 0) {
    return undefined;
  }

  const port = parsePort(input.slice(separatorIndex + 1));
  if (port === undefined) {
    return undefined;
  }

  return { host: input.slice(0, separatorIndex), port };
}

function stripHopByHopHeaders(
  headers: http.IncomingHttpHeaders | http.OutgoingHttpHeaders,
): http.OutgoingHttpHeaders {
  const blockedHeaders = new Set(HOP_BY_HOP_HEADERS);
  for (const token of parseConnectionHeaderTokens(headers.connection)) {
    blockedHeaders.add(token);
  }

  const out: http.OutgoingHttpHeaders = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!blockedHeaders.has(key.toLowerCase()) && value !== undefined) {
      out[key] = value;
    }
  }

  return out;
}

function parseConnectionHeaderTokens(value: http.OutgoingHttpHeader | undefined): string[] {
  /* v8 ignore next @preserve */
  if (value === undefined) {
    return [];
  }

  /* v8 ignore next @preserve */
  const values = Array.isArray(value) ? value : [String(value)];
  return values
    .flatMap((header) => header.split(","))
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);
}

function normalizeAllowedPorts(rawPorts: ReadonlyArray<number | string>): number[] {
  const ports = rawPorts.map((rawPort) => {
    const port = typeof rawPort === "number" ? rawPort : Number(rawPort);
    if (!isValidPort(port)) {
      throw new Error(`invalid TCP port in CLEARANCE_ALLOW_PORTS: ${String(rawPort)}`);
    }

    return port;
  });

  if (ports.length === 0) {
    throw new Error("CLEARANCE_ALLOW_PORTS must include at least one valid TCP port");
  }

  return [...new Set(ports)];
}

function parseIntegerEnv(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = env[name];
  if (value === undefined || value.trim().length === 0) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new TypeError(`${name} must be an integer`);
  }
  if (parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }

  return parsed;
}

function parsePort(rawPort: string | undefined): number | undefined {
  if (rawPort === undefined || rawPort.trim().length === 0) {
    return undefined;
  }

  const port = Number(rawPort);
  return isValidPort(port) ? port : undefined;
}

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port > 0 && port <= 65_535;
}

function isIpFamily(family: number): family is 4 | 6 {
  return family === 4 || family === 6;
}

function hasIpFamily(record: LookupAddress): record is ResolvedLookupAddress {
  return isIpFamily(record.family);
}

function isPrivateIpAddress(ip: string, family: 4 | 6): boolean {
  if (family === 4) {
    return PRIVATE_IPV4_BLOCK_LIST.check(ip, "ipv4");
  }

  return PRIVATE_IPV6_BLOCK_LIST.check(ip, "ipv6");
}

function createIpBlockList(
  ranges: ReadonlyArray<readonly [string, number]>,
  family: "ipv4" | "ipv6",
): net.BlockList {
  const blockList = new net.BlockList();
  for (const [address, prefix] of ranges) {
    blockList.addSubnet(address, prefix, family);
  }

  return blockList;
}

function httpReply(res: http.ServerResponse, status: number, body: string): void {
  res.writeHead(status, {
    connection: "close",
    "content-length": Buffer.byteLength(body),
    "content-type": "text/plain; charset=utf-8",
  });
  res.end(body);
}

function socketReply(socket: Duplex, status: number, reason: string, body: string): void {
  /* v8 ignore next @preserve */
  if (socket.destroyed) {
    return;
  }

  socket.end(
    `HTTP/1.1 ${status} ${reason}\r\ncontent-type: text/plain; charset=utf-8\r\ncontent-length: ${Buffer.byteLength(body)}\r\nconnection: close\r\n\r\n${body}`,
  );
}

function logDecision(logger: ClearanceLogger, input: DecisionLogInput): void {
  const parts = [
    input.decision,
    `method=${input.method}`,
    `host=${input.hostname}`,
    `port=${input.port}`,
  ];

  if (input.address !== undefined) {
    parts.push(`address=${input.address}`);
  }
  if (input.reason !== undefined) {
    parts.push(`reason=${input.reason}`);
  }

  logger.info(parts.join(" "));
}

function errorMessage(error: unknown): string {
  /* v8 ignore next @preserve */
  return error instanceof Error ? error.message : String(error);
}

function isNetSocket(socket: Duplex): socket is net.Socket {
  return socket instanceof net.Socket;
}

function noop(): void {
  // Intentionally ignore optional proxy log and socket error events.
}
