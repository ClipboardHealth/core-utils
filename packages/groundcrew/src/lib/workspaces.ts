/**
 * Workspace adapter — opens/lists/closes the host-side terminal session
 * that runs an agent for one ticket. `Workspace.name` is the ticket id;
 * callers key on it. Adapters do their own internal lookup when their
 * backend uses opaque refs.
 */

import { runCommandAsync } from "./commandRunner.ts";
import type { ResolvedConfig, WorkspaceKindSetting } from "./config.ts";
import { detectHostCapabilities, type HostCapabilities } from "./host.ts";
import { errorMessage, log } from "./util.ts";

export type WorkspaceKind = "cmux" | "tmux";

export interface Workspace {
  /** Ticket id; the join key callers use. */
  name: string;
}

export interface WorkspaceStatus {
  text: string;
  color?: string;
  icon?: string;
}

export interface OpenSpec {
  /** Ticket id; becomes the workspace's name. */
  name: string;
  /** Working directory the workspace runs in. */
  cwd: string;
  /** Shell string the workspace executes (host setup + agent exec). */
  command: string;
  /** Optional status painting. Adapters that can't paint silently drop it. */
  status?: WorkspaceStatus;
}

/**
 * `unavailable` is "we don't know" — never treat it as "empty," or callers
 * would close every live workspace by deduction.
 */
export type WorkspaceProbe =
  | { kind: "ok"; names: Set<string> }
  | { kind: "unavailable"; error?: unknown };

interface Adapter {
  open(spec: OpenSpec, signal?: AbortSignal): Promise<void>;
  /**
   * Live workspaces only. Returns:
   * - `Workspace[]` when the adapter probe succeeded (may be empty).
   * - `undefined` when the adapter binary failed in a way that doesn't
   *   distinguish "no live workspaces" from "couldn't ask".
   */
  list(signal?: AbortSignal): Promise<Workspace[] | undefined>;
  /** No-op when no workspace exists for `name`. */
  close(name: string, signal?: AbortSignal): Promise<void>;
}

async function runWorkspaceCommand(
  command: string,
  arguments_: readonly string[],
  signal?: AbortSignal,
): Promise<string> {
  return signal === undefined
    ? await runCommandAsync(command, arguments_)
    : await runCommandAsync(command, arguments_, { signal });
}

function isSignalAborted(signal?: AbortSignal): boolean {
  return signal?.aborted === true;
}

interface CmuxRawWorkspace {
  title: string;
  ref: string;
}

function parseCmuxList(output: string): CmuxRawWorkspace[] {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- cmux --json list-workspaces always emits this shape
  const parsed = JSON.parse(output) as {
    workspaces?: { title?: string; ref?: string; id?: string }[];
  };
  const items: CmuxRawWorkspace[] = [];
  /* v8 ignore next @preserve -- cmux always emits a workspaces field; default keeps the loop safe */
  for (const ws of parsed.workspaces ?? []) {
    if (typeof ws.title !== "string" || ws.title.length === 0) {
      continue;
    }
    items.push({ title: ws.title, ref: pickCmuxRef({ ...ws, title: ws.title }) });
  }
  return items;
}

/**
 * Pick the most-specific identifier cmux returned for this workspace.
 * Caller has already verified `title` is non-empty, so the title fallback
 * is always defined.
 */
function pickCmuxRef(ws: { title: string; ref?: string; id?: string }): string {
  if (typeof ws.ref === "string" && ws.ref.length > 0) {
    return ws.ref;
  }
  if (typeof ws.id === "string" && ws.id.length > 0) {
    return ws.id;
  }
  return ws.title;
}

async function listCmuxRaw(signal?: AbortSignal): Promise<CmuxRawWorkspace[] | undefined> {
  try {
    return parseCmuxList(await runWorkspaceCommand("cmux", ["--json", "list-workspaces"], signal));
  } catch (error) {
    if (isSignalAborted(signal)) {
      throw error;
    }
    log(`cmux list-workspaces failed: ${errorMessage(error)}`);
    return undefined;
  }
}

function extractCmuxOpenRef(output: string): string | undefined {
  try {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- cmux --json prints a workspace ref/id object
    const parsed = JSON.parse(output) as { ref?: string; id?: string };
    const candidate = parsed.ref ?? parsed.id ?? "";
    if (candidate.length > 0) {
      return candidate;
    }
  } catch {
    /* not JSON; fall through to regex */
  }
  const match = /workspace:\d+/.exec(output);
  return match ? match[0] : undefined;
}

async function applyCmuxStatus(
  ref: string,
  status: WorkspaceStatus,
  signal?: AbortSignal,
): Promise<void> {
  const arguments_ = ["set-status", "model", status.text];
  if (status.icon !== undefined) {
    arguments_.push("--icon", status.icon);
  }
  if (status.color !== undefined) {
    arguments_.push("--color", status.color);
  }
  arguments_.push("--workspace", ref);
  await runWorkspaceCommand("cmux", arguments_, signal);
}

const cmuxAdapter: Adapter = {
  async open(spec, signal) {
    const output = await runWorkspaceCommand(
      "cmux",
      [
        "--json",
        "new-workspace",
        "--name",
        spec.name,
        "--cwd",
        spec.cwd,
        "--command",
        spec.command,
      ],
      signal,
    );
    const ref = extractCmuxOpenRef(output);
    if (ref === undefined) {
      log(
        `cmux new-workspace returned unrecognized output for ${spec.name}; if a workspace was created, run \`cmux close-workspace\` manually.`,
      );
      throw new Error(`Unexpected cmux output: ${output}`);
    }
    if (spec.status !== undefined) {
      try {
        await applyCmuxStatus(ref, spec.status, signal);
      } catch (error) {
        try {
          await runWorkspaceCommand("cmux", ["close-workspace", "--workspace", ref], signal);
        } catch (closeError) {
          log(`cmux close-workspace failed for ${spec.name}: ${errorMessage(closeError)}`);
        }
        throw error;
      }
    }
  },
  async list(signal) {
    const raw = await listCmuxRaw(signal);
    return raw?.map((ws) => ({ name: ws.title }));
  },
  async close(name, signal) {
    const raw = await listCmuxRaw(signal);
    if (raw === undefined) {
      return;
    }
    const match = raw.find((ws) => ws.title === name);
    if (match === undefined) {
      return;
    }
    try {
      await runWorkspaceCommand("cmux", ["close-workspace", "--workspace", match.ref], signal);
    } catch (error) {
      if (isSignalAborted(signal)) {
        throw error;
      }
      const remaining = await listCmuxRaw(signal);
      if (remaining !== undefined) {
        const isStillPresent = remaining.some((ws) => ws.title === name);
        if (!isStillPresent) {
          return;
        }
      }
      throw error;
    }
  },
};

export interface WorkspaceResolution {
  requested: WorkspaceKindSetting;
  resolved: WorkspaceKind;
  /** One-line explanation of why `resolved` was chosen. */
  reason: string;
}

interface ResolveArguments {
  config: ResolvedConfig;
  host: HostCapabilities;
}

export function resolveWorkspaceKind(arguments_: ResolveArguments): WorkspaceResolution {
  const { config, host } = arguments_;
  const requested = config.workspaceKind;

  if (requested === "cmux" || requested === "tmux") {
    failIfBinaryUnavailable(requested, host);
    return { requested, resolved: requested, reason: `workspaceKind set to ${requested}` };
  }

  return resolveAuto({ requested, host });
}

function resolveAuto(arguments_: {
  requested: WorkspaceKindSetting;
  host: HostCapabilities;
}): WorkspaceResolution {
  const { requested, host } = arguments_;
  // cmux is macOS-only; non-macOS hosts with cmux on PATH (e.g. a stale
  // build artifact) still resolve to tmux so `auto` matches the documented
  // default and behaves correctly cross-platform.
  if (host.isMacOS && host.hasCmux) {
    return { requested, resolved: "cmux", reason: "auto: macOS with cmux available" };
  }
  if (host.hasTmux) {
    return {
      requested,
      resolved: "tmux",
      reason: "auto: cmux unavailable or non-macOS, falling back to tmux",
    };
  }
  throw new Error(
    "workspaceKind 'auto' could not pick a backend: neither cmux nor tmux is on PATH. Install one or set workspaceKind explicitly.",
  );
}

const HOST_CAPABILITY_BY_KIND: Record<WorkspaceKind, "hasCmux" | "hasTmux"> = {
  cmux: "hasCmux",
  tmux: "hasTmux",
};

function failIfBinaryUnavailable(kind: WorkspaceKind, host: HostCapabilities): void {
  if (kind === "cmux" && !host.isMacOS) {
    throw new Error(
      "workspaceKind 'cmux' is only supported on macOS. Switch to 'tmux' or 'auto' on this platform.",
    );
  }
  if (!host[HOST_CAPABILITY_BY_KIND[kind]]) {
    throw new Error(
      `workspaceKind '${kind}' is set but the ${kind} binary is not on PATH. Install ${kind} or change the setting.`,
    );
  }
}

const TMUX_SESSION = "groundcrew";

// `tmux new-session -d -s …` always creates one initial window. Without
// `-n`, that window is named after the running shell (e.g. "0" / "zsh") and
// would surface from `list()` as a phantom workspace. We name it with this
// sentinel and filter it out — it stays around as a placeholder so the
// session doesn't collapse when the last ticket window closes.
const TMUX_IDLE_WINDOW = "_groundcrew_idle";

function isTmuxNotFoundError(error: unknown): boolean {
  // runCommand surfaces the child's stderr in error.message, so the "no
  // server" / "missing session" / "can't find window" signatures are visible
  // without a separate stderr probe.
  const message = errorMessage(error);
  return (
    message.includes("no server running") ||
    message.includes("can't find session") ||
    message.includes("can't find window")
  );
}

type TmuxListProbe =
  | { status: "ok"; output: string }
  | { status: "missing" }
  | { status: "failed"; reason: string };

async function probeTmuxList(format: string, signal?: AbortSignal): Promise<TmuxListProbe> {
  try {
    return {
      status: "ok",
      output: await runWorkspaceCommand(
        "tmux",
        ["list-windows", "-t", TMUX_SESSION, "-F", format],
        signal,
      ),
    };
  } catch (error) {
    if (isSignalAborted(signal)) {
      throw error;
    }
    if (isTmuxNotFoundError(error)) {
      return { status: "missing" };
    }
    return { status: "failed", reason: errorMessage(error) };
  }
}

async function ensureTmuxSession(signal?: AbortSignal): Promise<void> {
  try {
    await runWorkspaceCommand("tmux", ["has-session", "-t", TMUX_SESSION], signal);
    return;
  } catch (error) {
    if (isSignalAborted(signal)) {
      throw error;
    }
    /* session missing or server down; create it */
  }
  try {
    await runWorkspaceCommand(
      "tmux",
      ["new-session", "-d", "-s", TMUX_SESSION, "-n", TMUX_IDLE_WINDOW],
      signal,
    );
  } catch (error) {
    if (isSignalAborted(signal)) {
      throw error;
    }
    try {
      await runWorkspaceCommand("tmux", ["has-session", "-t", TMUX_SESSION], signal);
    } catch {
      throw error;
    }
  }
}

function parseTmuxWindows(output: string): Workspace[] {
  const items: Workspace[] = [];
  for (const line of output.split("\n")) {
    if (line.length === 0) {
      continue;
    }
    const [name, deadFlag] = line.split("\t");
    /* v8 ignore next 3 @preserve -- split on a non-empty string always yields a non-empty first element */
    if (name === undefined || name.length === 0) {
      continue;
    }
    if (name === TMUX_IDLE_WINDOW) {
      continue;
    }
    // pane_dead != 0 means the command exited and the window is a zombie
    // (only happens when remain-on-exit is on; defense in depth in case a
    // user-globally-set value beats our per-window override).
    if (deadFlag !== undefined && deadFlag !== "0") {
      continue;
    }
    items.push({ name });
  }
  return items;
}

const tmuxAdapter: Adapter = {
  async open(spec, signal) {
    await ensureTmuxSession(signal);
    const target = `${TMUX_SESSION}:${spec.name}`;
    await runWorkspaceCommand(
      "tmux",
      [
        "new-window",
        "-d",
        "-t",
        TMUX_SESSION,
        "-n",
        spec.name,
        "-c",
        spec.cwd,
        spec.command,
        ";",
        "set-window-option",
        "-t",
        target,
        "remain-on-exit",
        "off",
        ";",
        "set-window-option",
        "-t",
        target,
        "allow-rename",
        "off",
      ],
      signal,
    );
    // tmux can't paint status pills; spec.status is silently dropped.
  },
  async list(signal) {
    const probe = await probeTmuxList("#{window_name}\t#{pane_dead}", signal);
    if (probe.status === "missing") {
      return [];
    }
    if (probe.status === "failed") {
      log(`tmux list-windows failed: ${probe.reason}`);
      // oxlint-disable-next-line unicorn/no-useless-undefined -- typed return for `Workspace[] | undefined`
      return;
    }
    return parseTmuxWindows(probe.output);
  },
  async close(name, signal) {
    try {
      await runWorkspaceCommand("tmux", ["kill-window", "-t", `${TMUX_SESSION}:${name}`], signal);
    } catch (error) {
      if (isSignalAborted(signal)) {
        throw error;
      }
      if (isTmuxNotFoundError(error)) {
        return;
      }
      throw error;
    }
  },
};

// Per-config cache: production resolves the adapter once at first use
// (loadConfig returns a frozen, cached instance); each test uses a fresh
// config object so the cache invalidates naturally between tests.
const adapterCache = new WeakMap<ResolvedConfig, Adapter>();

async function adapterFor(config: ResolvedConfig, signal?: AbortSignal): Promise<Adapter> {
  const cached = adapterCache.get(config);
  if (cached !== undefined) {
    return cached;
  }
  const { resolved } = resolveWorkspaceKind({
    config,
    host: await detectHostCapabilities(signal),
  });
  const adapter = resolved === "cmux" ? cmuxAdapter : tmuxAdapter;
  adapterCache.set(config, adapter);
  return adapter;
}

async function probeWorkspaces(
  config: ResolvedConfig,
  signal?: AbortSignal,
): Promise<WorkspaceProbe> {
  let raw: Workspace[] | undefined;
  try {
    const adapter = await adapterFor(config, signal);
    raw = await adapter.list(signal);
  } catch (error) {
    if (isSignalAborted(signal)) {
      throw error;
    }
    return { kind: "unavailable", error };
  }
  if (raw === undefined) {
    return { kind: "unavailable" };
  }
  return { kind: "ok", names: new Set(raw.map((ws) => ws.name)) };
}

export const workspaces = {
  async open(config: ResolvedConfig, spec: OpenSpec, signal?: AbortSignal): Promise<void> {
    const adapter = await adapterFor(config, signal);
    await adapter.open(spec, signal);
  },
  probe: probeWorkspaces,
  async close(config: ResolvedConfig, name: string, signal?: AbortSignal): Promise<void> {
    const adapter = await adapterFor(config, signal);
    await adapter.close(name, signal);
  },
};
