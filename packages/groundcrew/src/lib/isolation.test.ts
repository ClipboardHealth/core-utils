import type { IsolationStrategy, ResolvedConfig } from "./config.js";
import type { HostCapabilities } from "./host.js";
import { resolveIsolationStrategy } from "./isolation.js";

const SUPPORTED_HOST: HostCapabilities = {
  hasSafehouse: true,
  hasSbx: true,
  hasCmux: false,
  hasTmux: false,
  isMacOS: true,
  isSafehouseSupported: true,
};

const NO_TOOLS: HostCapabilities = {
  hasSafehouse: false,
  hasSbx: false,
  hasCmux: false,
  hasTmux: false,
  isMacOS: true,
  isSafehouseSupported: true,
};

function makeConfig(
  arguments_: {
    globalIsolation?: IsolationStrategy;
    modelIsolation?: IsolationStrategy;
    withSandbox?: boolean;
  } = {},
): ResolvedConfig {
  return {
    linear: {
      projectSlug: "x-aaaaaaaaaaaa",
      slugId: "aaaaaaaaaaaa",
      statuses: { todo: "Todo", inProgress: "In Progress", done: "Done", terminal: ["Done"] },
    },
    git: { remote: "origin", defaultBranch: "main" },
    workspace: {
      projectDir: "/work",
      knownRepositories: ["repo-a"],
    },
    orchestrator: {
      maximumInProgress: 4,
      pollIntervalMilliseconds: 1000,
      sessionLimitPercentage: 85,
    },
    models: {
      default: "claude",
      isolation: arguments_.globalIsolation ?? "auto",
      definitions: {
        claude: {
          cmd: "claude",
          color: "#fff",
          ...(arguments_.modelIsolation === undefined
            ? {}
            : { isolation: arguments_.modelIsolation }),
          ...(arguments_.withSandbox === false ? {} : { sandbox: { agent: "claude" } }),
        },
      },
    },
    prompts: { initial: "x" },
    workspaceKind: "auto",
  };
}

describe(resolveIsolationStrategy, () => {
  it("auto picks safehouse when the binary is on a supported host", () => {
    const actual = resolveIsolationStrategy({
      config: makeConfig(),
      model: "claude",
      host: SUPPORTED_HOST,
    });

    expect(actual.resolved).toBe("safehouse");
    expect(actual.reason).toMatch(/safehouse available/);
  });

  it("auto falls back to docker when safehouse is missing but sbx is configured", () => {
    const actual = resolveIsolationStrategy({
      config: makeConfig(),
      model: "claude",
      host: {
        hasSafehouse: false,
        hasSbx: true,
        hasCmux: false,
        hasTmux: false,
        isMacOS: true,
        isSafehouseSupported: true,
      },
    });

    expect(actual.resolved).toBe("docker");
    expect(actual.reason).toMatch(/falling back to Docker/);
  });

  it("auto falls back to docker when safehouse is unsupported (e.g., Linux)", () => {
    const actual = resolveIsolationStrategy({
      config: makeConfig(),
      model: "claude",
      host: {
        hasSafehouse: true,
        hasSbx: true,
        hasCmux: false,
        hasTmux: false,
        isMacOS: false,
        isSafehouseSupported: false,
      },
    });

    expect(actual.resolved).toBe("docker");
  });

  it("auto fails closed when neither safehouse nor sbx are available", () => {
    expect(() =>
      resolveIsolationStrategy({
        config: makeConfig(),
        model: "claude",
        host: NO_TOOLS,
      }),
    ).toThrow(/could not find an isolated runner/);
  });

  it("auto fails closed when the model has no sandbox config and safehouse is missing", () => {
    expect(() =>
      resolveIsolationStrategy({
        config: makeConfig({ withSandbox: false }),
        model: "claude",
        host: {
          hasSafehouse: false,
          hasSbx: true,
          hasCmux: false,
          hasTmux: false,
          isMacOS: true,
          isSafehouseSupported: true,
        },
      }),
    ).toThrow(/configure a sandbox block/);
  });

  it("explicit safehouse resolves when the binary is on PATH and the platform is supported", () => {
    const actual = resolveIsolationStrategy({
      config: makeConfig({ globalIsolation: "safehouse" }),
      model: "claude",
      host: SUPPORTED_HOST,
    });

    expect(actual.resolved).toBe("safehouse");
    expect(actual.requested).toBe("safehouse");
  });

  it("explicit safehouse fails when the binary is missing", () => {
    expect(() =>
      resolveIsolationStrategy({
        config: makeConfig({ globalIsolation: "safehouse" }),
        model: "claude",
        host: {
          hasSafehouse: false,
          hasSbx: false,
          hasCmux: false,
          hasTmux: false,
          isMacOS: true,
          isSafehouseSupported: true,
        },
      }),
    ).toThrow(/safehouse binary is not on PATH/);
  });

  it("explicit safehouse fails on an unsupported platform even with the binary", () => {
    expect(() =>
      resolveIsolationStrategy({
        config: makeConfig({ globalIsolation: "safehouse" }),
        model: "claude",
        host: {
          hasSafehouse: true,
          hasSbx: false,
          hasCmux: false,
          hasTmux: false,
          isMacOS: false,
          isSafehouseSupported: false,
        },
      }),
    ).toThrow(/only supported on macOS/);
  });

  it("explicit docker fails when the model has no sandbox config", () => {
    expect(() =>
      resolveIsolationStrategy({
        config: makeConfig({ globalIsolation: "docker", withSandbox: false }),
        model: "claude",
        host: SUPPORTED_HOST,
      }),
    ).toThrow(/no sandbox config/);
  });

  it("explicit docker fails when sbx is missing", () => {
    expect(() =>
      resolveIsolationStrategy({
        config: makeConfig({ globalIsolation: "docker" }),
        model: "claude",
        host: {
          hasSafehouse: false,
          hasSbx: false,
          hasCmux: false,
          hasTmux: false,
          isMacOS: true,
          isSafehouseSupported: true,
        },
      }),
    ).toThrow(/sbx binary is not on PATH/);
  });

  it("none always resolves regardless of host capabilities", () => {
    const actual = resolveIsolationStrategy({
      config: makeConfig({ globalIsolation: "none" }),
      model: "claude",
      host: NO_TOOLS,
    });

    expect(actual.resolved).toBe("none");
  });

  it("per-model isolation wins over the global default", () => {
    const actual = resolveIsolationStrategy({
      config: makeConfig({ globalIsolation: "auto", modelIsolation: "none" }),
      model: "claude",
      host: SUPPORTED_HOST,
    });

    expect(actual.resolved).toBe("none");
    expect(actual.requested).toBe("none");
  });

  it("rejects unknown models", () => {
    expect(() =>
      resolveIsolationStrategy({
        config: makeConfig(),
        model: "ghost",
        host: SUPPORTED_HOST,
      }),
    ).toThrow(/Unknown model: ghost/);
  });
});
