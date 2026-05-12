import { mkdtempSync, rmSync, writeFileSync } from "node:fs";

import { ensureClearance } from "@clipboard-health/clearance";

import type { RunCommandOptions } from "../lib/commandRunner.ts";
import { loadConfig, type ResolvedConfig } from "../lib/config.ts";
import { detectHostCapabilities } from "../lib/host.ts";
import type * as utilModule from "../lib/util.ts";
import { getLinearClient, log } from "../lib/util.ts";
import { type WorktreeEntry, worktrees, type WorktreeSpec } from "../lib/worktrees.ts";
import { deleteEnvironmentVariable, setEnvironmentVariable } from "../testHelpers/env.ts";
import { emptyTeardownResult } from "../testHelpers/teardownResult.ts";
import { setupWorkspace, setupWorkspaceCli } from "./setupWorkspace.ts";

// oxlint-disable-next-line jest/no-untyped-mock-factory -- typed dynamic imports conflict with Node builtin module typings
vi.mock("node:fs", () => ({
  mkdtempSync: vi.fn<typeof mkdtempSync>(),
  rmSync: vi.fn<typeof rmSync>(),
  writeFileSync: vi.fn<typeof writeFileSync>(),
}));
vi.mock(import("../lib/config.ts"), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, loadConfig: vi.fn<typeof loadConfig>() };
});
vi.mock(import("../lib/host.ts"), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, detectHostCapabilities: vi.fn<typeof detectHostCapabilities>() };
});
vi.mock(import("@clipboard-health/clearance"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ensureClearance: vi.fn<typeof ensureClearance>(),
  };
});
type RunCommandMock = (
  command: string,
  arguments_: readonly string[],
  options?: RunCommandOptions,
) => string;

const runCommandMock = vi.hoisted(() => vi.fn<RunCommandMock>());

vi.mock(import("../lib/commandRunner.ts"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    runCommand: runCommandMock,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test mock intentionally shares one recorder across sync and async command APIs.
    runCommandAsync: runCommandMock as unknown as typeof actual.runCommandAsync,
  };
});
vi.mock(import("../lib/util.ts"), async (importOriginal) => {
  const actual = await importOriginal<typeof utilModule>();
  return {
    ...actual,
    getLinearClient: vi.fn<typeof getLinearClient>(),
    log: vi.fn<typeof actual.log>(),
  };
});
vi.mock(import("../lib/worktrees.ts"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    worktrees: {
      ...actual.worktrees,
      create: vi.fn<typeof actual.worktrees.create>(),
      teardown: vi.fn<typeof actual.worktrees.teardown>(),
    },
  };
});

const mkdtempMock = vi.mocked(mkdtempSync);
const writeFileMock = vi.mocked(writeFileSync);
const rmMock = vi.mocked(rmSync);
const loadConfigMock = vi.mocked(loadConfig);
const detectHostMock = vi.mocked(detectHostCapabilities);
const ensureClearanceMock = vi.mocked(ensureClearance);
const linearClientMock = vi.mocked(getLinearClient);
const logMock = vi.mocked(log);
const createMock = vi.mocked(worktrees.create);
const teardownMock = vi.mocked(worktrees.teardown);

interface MockedLabel {
  name: string;
}
interface MockedIssue {
  title: string;
  description?: string | undefined;
}
const issueResolver = vi.fn<(id: string) => Promise<MockedIssue>>();
const rawRequestMock =
  vi.fn<(query: string, variables?: Record<string, unknown>) => Promise<unknown>>();

function buildMockedIssue(overrides: {
  title?: string;
  description?: string | undefined;
}): MockedIssue {
  return {
    title: overrides.title ?? "Title",
    description: "description" in overrides ? overrides.description : "Body",
  };
}

function buildResolveIssueResponse(overrides: {
  title?: string;
  description?: string | null | undefined;
  labels?: MockedLabel[];
}): unknown {
  return {
    data: {
      issue: {
        title: overrides.title ?? "Title",
        description: "description" in overrides ? overrides.description : "Body for repo-a",
        labels: { nodes: overrides.labels ?? [] },
      },
    },
  };
}

function hostEntry(): WorktreeEntry {
  return {
    repository: "repo-a",
    ticket: "team-1",
    branchName: "rocky-team-1",
    dir: "/work/repo-a-team-1",
    kind: "host",
  };
}

function sandboxEntry(): WorktreeEntry {
  return {
    repository: "repo-a",
    ticket: "team-1",
    branchName: "rocky-team-1",
    dir: "/work/repo-a/.sbx/groundcrew-repo-a-claude-worktrees/rocky-team-1",
    kind: "sandbox",
    sandboxName: "groundcrew-repo-a-claude",
  };
}

function makeConfig(overrides: Partial<ResolvedConfig["models"]> = {}): ResolvedConfig {
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
      isolation: "none",
      definitions: {
        claude: { cmd: "claude --auto", color: "#fff" },
        codex: { cmd: "codex", color: "#000" },
      },
      ...overrides,
    },
    prompts: {
      initial: "Begin {{ticket}} ({{title}}) in {{worktree}}\n{{description}}",
    },
    workspaceKind: "auto",
  };
}

function mockLinearClient(): void {
  const linearClient = { issue: issueResolver, client: { rawRequest: rawRequestMock } };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- tests stub only the surfaces touched by setupWorkspace + fetchResolvedIssue
  const typedLinearClient = linearClient as unknown as ReturnType<typeof getLinearClient>;
  linearClientMock.mockReturnValue(typedLinearClient);
}

function isCmuxNewWorkspace(cmd: string, arguments_: readonly string[]): boolean {
  return cmd === "cmux" && arguments_.includes("new-workspace");
}

function mockCmuxNewWorkspaceOutput(output: string): void {
  runCommandMock.mockImplementation((cmd, arguments_) =>
    isCmuxNewWorkspace(cmd, arguments_) ? output : "",
  );
}

function mockCmuxFailure(): void {
  runCommandMock.mockImplementation((cmd) => {
    if (cmd === "cmux") {
      throw new Error("cmux down");
    }
    return "";
  });
}

function mockDockerHost(): void {
  detectHostMock.mockResolvedValue({
    hasSafehouse: false,
    hasSbx: true,
    hasCmux: true,
    hasTmux: false,
    isMacOS: true,
    isSafehouseSupported: true,
  });
}

function lastRunArgumentFromCallWithArgument(argument: string): string {
  const call = runCommandMock.mock.calls.find((candidate) => candidate[1].includes(argument));
  const lastArgument = call?.[1].at(-1);
  return typeof lastArgument === "string" ? lastArgument : "";
}

function runArgumentsFromCallWithArgument(argument: string): readonly string[] {
  const call = runCommandMock.mock.calls.find((candidate) => candidate[1].includes(argument));
  return call?.[1] ?? [];
}

function lastCreateSpec(): WorktreeSpec | undefined {
  return createMock.mock.calls.at(-1)?.[1];
}

interface InvocationOrderRecorder {
  mock: { invocationCallOrder: readonly number[] };
}

function firstInvocationOrder(recorder: InvocationOrderRecorder): number {
  const [order] = recorder.mock.invocationCallOrder;
  if (order === undefined) {
    throw new Error("expected invocation order");
  }
  return order;
}

describe(setupWorkspace, () => {
  beforeEach(() => {
    mockLinearClient();
    issueResolver.mockResolvedValue(buildMockedIssue({ title: "Test Title", description: "Body" }));
    detectHostMock.mockResolvedValue({
      hasSafehouse: false,
      hasSbx: false,
      hasCmux: true,
      hasTmux: false,
      isMacOS: true,
      isSafehouseSupported: true,
    });
    createMock.mockImplementation(async (_config, spec) =>
      spec.strategy === "docker" ? sandboxEntry() : hostEntry(),
    );
    ensureClearanceMock.mockResolvedValue({
      logPath: "/tmp/clearance/clearance.log",
      pidPath: "/tmp/clearance/clearance.pid",
      port: 19_999,
      status: "already-running",
    });
    mkdtempMock.mockReturnValue("/tmp/groundcrew-team-1-x");
    runCommandMock.mockReturnValue("");
    teardownMock.mockResolvedValue(emptyTeardownResult());
  });

  afterEach(() => {
    // resetAllMocks (not clearAllMocks) so module-scoped mock implementations
    // set inside one test don't leak into the next.
    vi.resetAllMocks();
  });

  it("provisions the worktree, writes the prompt, and launches cmux", async () => {
    const config = makeConfig();
    mockCmuxNewWorkspaceOutput(JSON.stringify({ ref: "workspace:42" }));

    await setupWorkspace(config, { ticket: "team-1", repository: "repo-a", model: "claude" });

    expect(createMock).toHaveBeenCalledWith(
      config,
      expect.objectContaining({ repository: "repo-a", ticket: "team-1", model: "claude" }),
    );
    expect(writeFileMock).toHaveBeenCalledWith(
      "/tmp/groundcrew-team-1-x/prompt.txt",
      expect.stringContaining("Begin team-1 (Test Title) in repo-a-team-1"),
    );
    expect(runCommandMock).toHaveBeenCalledWith(
      "cmux",
      expect.arrayContaining(["new-workspace", "--name", "team-1"]),
    );
    expect(runCommandMock).toHaveBeenCalledWith(
      "cmux",
      expect.arrayContaining(["set-status", "model", "claude", "--workspace", "workspace:42"]),
    );
  });

  it("passes an AbortSignal into worktree creation and workspace launch", async () => {
    const config = makeConfig();
    const { signal } = new AbortController();
    mockCmuxNewWorkspaceOutput(JSON.stringify({ ref: "workspace:42" }));

    await setupWorkspace(
      config,
      { ticket: "team-1", repository: "repo-a", model: "claude" },
      { signal },
    );

    expect(createMock).toHaveBeenCalledWith(
      config,
      expect.objectContaining({ repository: "repo-a", ticket: "team-1", model: "claude" }),
      signal,
    );
    expect(runCommandMock).toHaveBeenCalledWith(
      "cmux",
      expect.arrayContaining(["new-workspace", "--name", "team-1"]),
      { signal },
    );
  });

  it("uses provided ticket details without fetching from Linear", async () => {
    const config = makeConfig();
    mockCmuxNewWorkspaceOutput(JSON.stringify({ ref: "workspace:42" }));

    await setupWorkspace(config, {
      ticket: "team-1",
      repository: "repo-a",
      model: "claude",
      details: { title: "Provided Title", description: "Provided Body" },
    });

    expect(issueResolver).not.toHaveBeenCalled();
    expect(writeFileMock).toHaveBeenCalledWith(
      "/tmp/groundcrew-team-1-x/prompt.txt",
      expect.stringContaining("Provided Title"),
    );
  });

  it("wraps the agent command with safehouse and runs the host setup script when the safehouse strategy is selected", async () => {
    detectHostMock.mockResolvedValue({
      hasSafehouse: true,
      hasSbx: false,
      hasCmux: true,
      hasTmux: false,
      isMacOS: true,
      isSafehouseSupported: true,
    });
    const config = makeConfig({
      isolation: "safehouse",
      definitions: {
        claude: {
          cmd: "claude --permission-mode auto",
          color: "#fff",
        },
      },
    });
    mockCmuxNewWorkspaceOutput(JSON.stringify({ ref: "workspace:42" }));

    await setupWorkspace(config, { ticket: "team-1", repository: "repo-a", model: "claude" });

    expect(ensureClearanceMock).toHaveBeenCalledTimes(1);
    expect(firstInvocationOrder(ensureClearanceMock)).toBeLessThan(
      firstInvocationOrder(createMock),
    );
    const command = lastRunArgumentFromCallWithArgument("new-workspace");
    expect(command).toContain("cd '/work/repo-a-team-1'");
    expect(command).toContain("./.claude/setup.sh --deps-only");
    expect(command).toContain("exec '/");
    expect(command).toContain("/packages/clearance/safehouse/safehouse-clearance' claude");
    expect(command).toContain('claude --permission-mode auto "$_p"');
    expect(command).not.toContain("sbx exec");
    // setup-status guard so a failed install still launches the agent
    expect(command).toContain('"$setup_status" -ne 0');
  });

  it("does not create a worktree when the safehouse clearance cannot start", async () => {
    detectHostMock.mockResolvedValue({
      hasSafehouse: true,
      hasSbx: false,
      hasCmux: true,
      hasTmux: false,
      isMacOS: true,
      isSafehouseSupported: true,
    });
    ensureClearanceMock.mockRejectedValue(new Error("proxy unavailable"));
    const config = makeConfig({ isolation: "safehouse" });

    await expect(
      setupWorkspace(config, { ticket: "team-1", repository: "repo-a", model: "claude" }),
    ).rejects.toThrow("proxy unavailable");

    expect(createMock).not.toHaveBeenCalled();
  });

  it("does not double-wrap when the cmd already starts with safehouse", async () => {
    detectHostMock.mockResolvedValue({
      hasSafehouse: true,
      hasSbx: false,
      hasCmux: true,
      hasTmux: false,
      isMacOS: true,
      isSafehouseSupported: true,
    });
    const config = makeConfig({
      isolation: "safehouse",
      definitions: {
        claude: {
          // A user upgrading from main has `safehouse` baked into their cmd;
          // the strategy must not produce `safehouse safehouse claude ...`.
          cmd: "safehouse claude --permission-mode auto",
          color: "#fff",
        },
      },
    });
    mockCmuxNewWorkspaceOutput(JSON.stringify({ ref: "workspace:42" }));

    await setupWorkspace(config, { ticket: "team-1", repository: "repo-a", model: "claude" });

    const command = lastRunArgumentFromCallWithArgument("new-workspace");
    expect(command).toContain('exec safehouse claude --permission-mode auto "$_p"');
    expect(command).not.toContain("safehouse safehouse");
  });

  it("falls through to direct execution under the none strategy", async () => {
    const config = makeConfig({
      isolation: "none",
      definitions: {
        claude: { cmd: "claude --permission-mode auto", color: "#fff" },
      },
    });
    mockCmuxNewWorkspaceOutput(JSON.stringify({ ref: "workspace:42" }));

    await setupWorkspace(config, { ticket: "team-1", repository: "repo-a", model: "claude" });

    const command = lastRunArgumentFromCallWithArgument("new-workspace");
    expect(command).toContain('exec claude --permission-mode auto "$_p"');
    expect(command).not.toContain("safehouse");
    expect(command).not.toContain("sbx exec");
  });

  describe("build-time secret shuttling", () => {
    afterEach(() => {
      deleteEnvironmentVariable("NPM_TOKEN");
      deleteEnvironmentVariable("BUF_TOKEN");
    });

    it("stages secrets.env (mode 0600) and references it in the launch command when NPM_TOKEN is set", async () => {
      setEnvironmentVariable("NPM_TOKEN", "npm_test_token");
      deleteEnvironmentVariable("BUF_TOKEN");
      mockCmuxNewWorkspaceOutput(JSON.stringify({ ref: "workspace:1" }));

      await setupWorkspace(makeConfig(), {
        ticket: "team-1",
        repository: "repo-a",
        model: "claude",
      });

      expect(writeFileMock).toHaveBeenCalledWith(
        "/tmp/groundcrew-team-1-x/secrets.env",
        "NPM_TOKEN='npm_test_token'\n",
        { mode: 0o600 },
      );
      const command = lastRunArgumentFromCallWithArgument("new-workspace");
      expect(command).toContain(". '/tmp/groundcrew-team-1-x/secrets.env'");
      expect(command).toContain("unset NPM_TOKEN BUF_TOKEN");
    });

    it("escapes single quotes in secret values so the file is sourceable", async () => {
      setEnvironmentVariable("NPM_TOKEN", "npm_with'quote");
      deleteEnvironmentVariable("BUF_TOKEN");
      mockCmuxNewWorkspaceOutput(JSON.stringify({ ref: "workspace:1" }));

      await setupWorkspace(makeConfig(), {
        ticket: "team-1",
        repository: "repo-a",
        model: "claude",
      });

      expect(writeFileMock).toHaveBeenCalledWith(
        "/tmp/groundcrew-team-1-x/secrets.env",
        `${String.raw`NPM_TOKEN='npm_with'\''quote'`}\n`,
        { mode: 0o600 },
      );
    });

    it("stages both NPM_TOKEN and BUF_TOKEN when both are set", async () => {
      setEnvironmentVariable("NPM_TOKEN", "npm_test");
      setEnvironmentVariable("BUF_TOKEN", "buf_test");
      mockCmuxNewWorkspaceOutput(JSON.stringify({ ref: "workspace:1" }));

      await setupWorkspace(makeConfig(), {
        ticket: "team-1",
        repository: "repo-a",
        model: "claude",
      });

      expect(writeFileMock).toHaveBeenCalledWith(
        "/tmp/groundcrew-team-1-x/secrets.env",
        "NPM_TOKEN='npm_test'\nBUF_TOKEN='buf_test'\n",
        { mode: 0o600 },
      );
    });

    it("skips secrets.env entirely when no build secrets are set", async () => {
      deleteEnvironmentVariable("NPM_TOKEN");
      deleteEnvironmentVariable("BUF_TOKEN");
      mockCmuxNewWorkspaceOutput(JSON.stringify({ ref: "workspace:1" }));

      await setupWorkspace(makeConfig(), {
        ticket: "team-1",
        repository: "repo-a",
        model: "claude",
      });

      expect(writeFileMock).not.toHaveBeenCalledWith(
        expect.stringContaining("secrets.env"),
        expect.anything(),
        expect.anything(),
      );
      const command = lastRunArgumentFromCallWithArgument("new-workspace");
      expect(command).not.toContain("secrets.env");
      expect(command).not.toContain("unset NPM_TOKEN");
    });
  });

  it("fails before creating a worktree when auto cannot find isolation tooling", async () => {
    const config = makeConfig({ isolation: "auto" });

    await expect(
      setupWorkspace(config, { ticket: "team-1", repository: "repo-a", model: "claude" }),
    ).rejects.toThrow(/could not find an isolated runner/);

    expect(createMock).not.toHaveBeenCalled();
    expect(ensureClearanceMock).not.toHaveBeenCalled();
  });

  it("creates an sbx branch worktree and launches the agent through sbx exec", async () => {
    mockDockerHost();
    const config = makeConfig({
      definitions: {
        claude: {
          cmd: "claude --permission-mode auto",
          color: "#fff",
          isolation: "docker",
          sandbox: { agent: "claude", setupCommand: "custom setup" },
        },
      },
    });
    mockCmuxNewWorkspaceOutput(JSON.stringify({ ref: "workspace:42" }));

    await setupWorkspace(config, { ticket: "team-1", repository: "repo-a", model: "claude" });

    expect(lastCreateSpec()).toMatchObject({
      repository: "repo-a",
      ticket: "team-1",
      model: "claude",
      strategy: "docker",
    });
    const arguments_ = runArgumentsFromCallWithArgument("new-workspace");
    const command = lastRunArgumentFromCallWithArgument("new-workspace");
    expect(arguments_).toStrictEqual(
      expect.arrayContaining([
        "--cwd",
        "/work/repo-a/.sbx/groundcrew-repo-a-claude-worktrees/rocky-team-1",
      ]),
    );
    expect(command).toContain(
      'exec sbx exec -it -w \'/work/repo-a/.sbx/groundcrew-repo-a-claude-worktrees/rocky-team-1\' \'groundcrew-repo-a-claude\' sh -lc \'custom setup; setup_status=$?; if [ "$setup_status" -ne 0 ]; then echo "groundcrew setup command exited with status $setup_status; continuing to agent." >&2; fi; exec claude --permission-mode auto "$@"\' sh "$_p"',
    );
  });

  it("continues to the sandbox agent when dependency setup fails", async () => {
    mockDockerHost();
    const config = makeConfig({
      definitions: {
        claude: {
          cmd: "claude --permission-mode auto",
          color: "#fff",
          isolation: "docker",
          sandbox: { agent: "claude", setupCommand: "false" },
        },
      },
    });
    mockCmuxNewWorkspaceOutput(JSON.stringify({ ref: "workspace:42" }));

    await setupWorkspace(config, { ticket: "team-1", repository: "repo-a", model: "claude" });

    const command = lastRunArgumentFromCallWithArgument("new-workspace");
    expect(command).toContain("false; setup_status=$?");
    expect(command).toContain("continuing to agent");
    expect(command).toContain('exec claude --permission-mode auto "$@"');
  });

  it("uses the default sandbox setup command when a sandbox does not override it", async () => {
    mockDockerHost();
    const config = makeConfig({
      definitions: {
        claude: {
          cmd: "claude --permission-mode auto",
          color: "#fff",
          isolation: "docker",
          sandbox: { agent: "claude" },
        },
      },
    });
    mockCmuxNewWorkspaceOutput(JSON.stringify({ ref: "workspace:42" }));

    await setupWorkspace(config, { ticket: "team-1", repository: "repo-a", model: "claude" });

    const command = lastRunArgumentFromCallWithArgument("new-workspace");
    expect(command).toContain("npm install --global n");
    expect(command).toContain('sudo "$n_path" "$required_node"');
    expect(command).toContain("./.claude/setup.sh --deps-only");
    expect(command).toContain("npm clean-install");
  });

  it("propagates worktree-creation errors without launching cmux", async () => {
    createMock.mockImplementation(() => {
      throw new Error("Worktree already exists: /work/repo-a-team-1");
    });

    await expect(
      setupWorkspace(makeConfig(), {
        ticket: "team-1",
        repository: "repo-a",
        model: "claude",
      }),
    ).rejects.toThrow(/Worktree already exists/);
    expect(runCommandMock).not.toHaveBeenCalledWith(
      "cmux",
      expect.arrayContaining(["new-workspace"]),
    );
  });

  it("rejects unknown models", async () => {
    await expect(
      setupWorkspace(makeConfig(), { ticket: "team-1", repository: "repo-a", model: "ghost" }),
    ).rejects.toThrow(/Unknown model: ghost/);
  });

  it("rolls back the worktree, branch, and cmux workspace when cmux launch fails", async () => {
    const config = makeConfig();
    mockCmuxNewWorkspaceOutput("garbage that has no ref");

    await expect(
      setupWorkspace(config, { ticket: "team-1", repository: "repo-a", model: "claude" }),
    ).rejects.toThrow(/Unexpected cmux output/);

    expect(teardownMock).toHaveBeenCalledWith(
      config,
      [
        expect.objectContaining({
          repository: "repo-a",
          ticket: "team-1",
          kind: "host",
          dir: "/work/repo-a-team-1",
          branchName: "rocky-team-1",
        }),
      ],
      { force: true },
    );
    expect(rmMock).toHaveBeenCalledWith("/tmp/groundcrew-team-1-x", expect.anything());
  });

  it("rolls back the sbx branch worktree without removing the persistent sandbox", async () => {
    mockDockerHost();
    const config = makeConfig({
      definitions: {
        claude: {
          cmd: "claude --permission-mode auto",
          color: "#fff",
          isolation: "docker",
          sandbox: { agent: "claude" },
        },
      },
    });
    mockCmuxFailure();

    await expect(
      setupWorkspace(config, { ticket: "team-1", repository: "repo-a", model: "claude" }),
    ).rejects.toThrow(/cmux down/);

    expect(teardownMock).toHaveBeenCalledWith(
      config,
      [
        expect.objectContaining({
          kind: "sandbox",
          sandboxName: "groundcrew-repo-a-claude",
          dir: "/work/repo-a/.sbx/groundcrew-repo-a-claude-worktrees/rocky-team-1",
        }),
      ],
      { force: true },
    );
    expect(runCommandMock).not.toHaveBeenCalledWith(
      "sbx",
      expect.arrayContaining(["rm"]),
      expect.anything(),
    );
  });

  it("falls back to extracting workspace:N from non-JSON cmux output", async () => {
    const config = makeConfig();
    mockCmuxNewWorkspaceOutput("Created workspace:99 successfully");

    await setupWorkspace(config, { ticket: "team-1", repository: "repo-a", model: "claude" });

    expect(runCommandMock).toHaveBeenCalledWith(
      "cmux",
      expect.arrayContaining(["set-status", "model", "claude", "--workspace", "workspace:99"]),
    );
  });

  it("falls back to the regex match when JSON is parseable but lacks ref/id", async () => {
    mockCmuxNewWorkspaceOutput(JSON.stringify({ name: "no-ref", info: "see workspace:55" }));

    await setupWorkspace(makeConfig(), {
      ticket: "team-1",
      repository: "repo-a",
      model: "claude",
    });

    expect(runCommandMock).toHaveBeenCalledWith(
      "cmux",
      expect.arrayContaining(["--workspace", "workspace:55"]),
    );
  });

  it("rolls back without touching the prompt dir when Linear fails before mkdtemp", async () => {
    issueResolver.mockRejectedValue(new Error("linear unreachable"));

    await expect(
      setupWorkspace(makeConfig(), {
        ticket: "team-1",
        repository: "repo-a",
        model: "claude",
      }),
    ).rejects.toThrow(/linear unreachable/);

    expect(rmMock).not.toHaveBeenCalled();
    expect(teardownMock).toHaveBeenCalledWith(
      expect.anything(),
      [expect.objectContaining({ ticket: "team-1" })],
      { force: true },
    );
  });

  it("uses the JSON id field when ref is missing", async () => {
    mockCmuxNewWorkspaceOutput(JSON.stringify({ id: "workspace:7" }));

    await setupWorkspace(makeConfig(), {
      ticket: "team-1",
      repository: "repo-a",
      model: "claude",
    });

    expect(runCommandMock).toHaveBeenCalledWith(
      "cmux",
      expect.arrayContaining(["--workspace", "workspace:7"]),
    );
  });

  it("rolls back even when cmux close-workspace fails", async () => {
    const config = makeConfig();
    // 1. new-workspace returns ref. 2. set-status throws → adapter
    // attempts close-workspace internally. 3. close-workspace throws
    // too → adapter swallows the close error and rethrows the original.
    runCommandMock
      .mockReturnValueOnce(JSON.stringify({ ref: "workspace:42" }))
      .mockImplementationOnce(() => {
        throw new Error("set-status failed");
      })
      .mockImplementationOnce(() => {
        throw new Error("close failed");
      });

    await expect(
      setupWorkspace(config, { ticket: "team-1", repository: "repo-a", model: "claude" }),
    ).rejects.toThrow(/set-status failed/);

    expect(runCommandMock).toHaveBeenCalledWith("cmux", [
      "close-workspace",
      "--workspace",
      "workspace:42",
    ]);
  });

  it("ignores rmSync failures during rollback", async () => {
    const config = makeConfig();
    mockCmuxFailure();
    rmMock.mockImplementation(() => {
      throw new Error("rm failed");
    });

    await expect(
      setupWorkspace(config, { ticket: "team-1", repository: "repo-a", model: "claude" }),
    ).rejects.toThrow(/cmux down/);
  });

  it("ignores worktree remove failures reported by teardown during rollback", async () => {
    const config = makeConfig();
    mockCmuxFailure();
    teardownMock.mockResolvedValue(
      emptyTeardownResult({
        failures: [{ entry: hostEntry(), step: "worktree_remove", error: new Error("busy") }],
      }),
    );

    await expect(
      setupWorkspace(config, { ticket: "team-1", repository: "repo-a", model: "claude" }),
    ).rejects.toThrow(/cmux down/);
  });

  it("keeps the original setup error and cleans promptDir when teardown rejects", async () => {
    const config = makeConfig();
    mockCmuxFailure();
    teardownMock.mockRejectedValue(new Error("teardown failed"));

    await expect(
      setupWorkspace(config, { ticket: "team-1", repository: "repo-a", model: "claude" }),
    ).rejects.toThrow(/cmux down/);

    expect(rmMock).toHaveBeenCalledWith("/tmp/groundcrew-team-1-x", expect.anything());
    expect(logMock).toHaveBeenCalledWith(
      expect.stringContaining("Worktree teardown failed during rollback: teardown failed"),
    );
  });

  it("warns about an orphaned workspace when teardown reports the adapter unavailable", async () => {
    const config = makeConfig();
    mockCmuxFailure();
    teardownMock.mockResolvedValue(
      emptyTeardownResult({
        workspaceProbe: { kind: "unavailable", error: new Error("cmux exploded") },
      }),
    );

    await expect(
      setupWorkspace(config, { ticket: "team-1", repository: "repo-a", model: "claude" }),
    ).rejects.toThrow(/cmux down/);

    expect(logMock).toHaveBeenCalledWith(
      expect.stringContaining("Workspace adapter unavailable during rollback: cmux exploded"),
    );
  });

  it("still warns when teardown reports the adapter unavailable without an error", async () => {
    const config = makeConfig();
    mockCmuxFailure();
    teardownMock.mockResolvedValue(
      emptyTeardownResult({ workspaceProbe: { kind: "unavailable" } }),
    );

    await expect(
      setupWorkspace(config, { ticket: "team-1", repository: "repo-a", model: "claude" }),
    ).rejects.toThrow(/cmux down/);

    expect(logMock).toHaveBeenCalledWith(
      expect.stringContaining("Workspace adapter unavailable during rollback;"),
    );
  });

  it("renders an empty description when Linear returns no description", async () => {
    issueResolver.mockResolvedValue(buildMockedIssue({ title: "T", description: undefined }));
    mockCmuxNewWorkspaceOutput(JSON.stringify({ ref: "workspace:1" }));

    await setupWorkspace(makeConfig(), {
      ticket: "team-1",
      repository: "repo-a",
      model: "claude",
    });

    const [writeCall] = writeFileMock.mock.calls;
    expect(writeCall?.[1]).toContain("(T)");
    expect(writeCall?.[1]).not.toContain("undefined");
  });

  it("escapes single quotes in the prompt path inside the launch command", async () => {
    mkdtempMock.mockReturnValue("/tmp/with'quote-1");
    mockCmuxNewWorkspaceOutput(JSON.stringify({ ref: "workspace:1" }));

    await setupWorkspace(makeConfig(), {
      ticket: "team-1",
      repository: "repo-a",
      model: "claude",
    });

    const cmd = lastRunArgumentFromCallWithArgument("new-workspace");
    expect(cmd).toContain(String.raw`'\''`);
  });
});

describe(setupWorkspaceCli, () => {
  beforeEach(() => {
    mockLinearClient();
    rawRequestMock.mockResolvedValue(buildResolveIssueResponse({}));
    detectHostMock.mockResolvedValue({
      hasSafehouse: false,
      hasSbx: false,
      hasCmux: true,
      hasTmux: false,
      isMacOS: true,
      isSafehouseSupported: true,
    });
    createMock.mockResolvedValue(hostEntry());
    mkdtempMock.mockReturnValue("/tmp/groundcrew-team-1-x");
    runCommandMock.mockReturnValue(JSON.stringify({ ref: "workspace:1" }));
    loadConfigMock.mockResolvedValue(makeConfig());
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("uses the repository hint and default model when the ticket has no agent label", async () => {
    await setupWorkspaceCli("team-1");

    expect(createMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ repository: "repo-a", model: "claude", ticket: "team-1" }),
    );
    expect(runCommandMock).toHaveBeenCalledWith(
      "cmux",
      expect.arrayContaining(["set-status", "model", "claude"]),
    );
  });

  it("rejects when the ticket description has no known repository", async () => {
    rawRequestMock.mockResolvedValue(buildResolveIssueResponse({ description: "Body" }));

    await expect(setupWorkspaceCli("team-1")).rejects.toThrow(
      /No known repository found in ticket TEAM-1 description/,
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it("infers the repository from the Linear description", async () => {
    const config = makeConfig();
    config.workspace.knownRepositories = ["repo-a", "repo-b"];
    loadConfigMock.mockResolvedValue(config);
    rawRequestMock.mockResolvedValue(
      buildResolveIssueResponse({ description: "Touches repo-b for the migration." }),
    );

    await setupWorkspaceCli("team-1");

    expect(createMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ repository: "repo-b" }),
    );
  });

  it("picks the model from the ticket's agent-* label", async () => {
    rawRequestMock.mockResolvedValue(
      buildResolveIssueResponse({ labels: [{ name: "agent-codex" }, { name: "priority/low" }] }),
    );

    await setupWorkspaceCli("team-1");

    expect(createMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ model: "codex" }),
    );
  });

  it("collapses agent-any to the configured default model", async () => {
    rawRequestMock.mockResolvedValue(
      buildResolveIssueResponse({ labels: [{ name: "agent-any" }] }),
    );

    await setupWorkspaceCli("team-1");

    expect(createMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ model: "claude" }),
    );
  });

  it("falls back to the default model for unknown agent-* labels", async () => {
    rawRequestMock.mockResolvedValue(
      buildResolveIssueResponse({ labels: [{ name: "agent-ghost" }] }),
    );

    await setupWorkspaceCli("team-1");

    expect(createMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ model: "claude" }),
    );
  });

  it("lowercases an uppercase ticket arg before provisioning", async () => {
    await setupWorkspaceCli("STAFF-508");

    expect(createMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ticket: "staff-508" }),
    );
    expect(runCommandMock).toHaveBeenCalledWith(
      "cmux",
      expect.arrayContaining(["new-workspace", "--name", "staff-508"]),
    );
  });

  it("queries Linear with the upper-case ticket identifier", async () => {
    await setupWorkspaceCli("staff-508");

    expect(rawRequestMock).toHaveBeenCalledWith(
      expect.stringContaining("ResolveIssue"),
      expect.objectContaining({ id: "STAFF-508" }),
    );
  });

  it("rejects when resolving the repository from a null description", async () => {
    rawRequestMock.mockResolvedValue(buildResolveIssueResponse({ description: null }));

    await expect(setupWorkspaceCli("team-1")).rejects.toThrow(
      /No known repository found in ticket TEAM-1 description/,
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it("throws a clear error when Linear has no issue with that id", async () => {
    rawRequestMock.mockResolvedValue({ data: { issue: null } });

    await expect(setupWorkspaceCli("ghost-999")).rejects.toThrow(
      /Ticket GHOST-999 not found in Linear/,
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it("does not re-fetch from Linear once fetchResolvedIssue has the details", async () => {
    await setupWorkspaceCli("team-1");

    expect(rawRequestMock).toHaveBeenCalledTimes(1);
    expect(issueResolver).not.toHaveBeenCalled();
  });

  it("resolves and reports without provisioning when dryRun is true", async () => {
    rawRequestMock.mockResolvedValue(
      buildResolveIssueResponse({
        description: "Body for repo-a",
        labels: [{ name: "agent-codex" }],
      }),
    );

    await setupWorkspaceCli("team-1", { dryRun: true });

    expect(createMock).not.toHaveBeenCalled();
    expect(runCommandMock).not.toHaveBeenCalled();
    const logged = logMock.mock.calls.map(([message]) => message).join("\n");
    expect(logged).toContain("[dry-run] Would launch team-1 in repo-a (codex)");
  });
});
