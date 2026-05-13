import type { LinearClient } from "@linear/sdk";

import { captureConsoleLog, type ConsoleCapture } from "../testHelpers/consoleCapture.ts";
import { createBoardSource, isTerminalStatus } from "./boardSource.ts";
import type { ResolvedConfig } from "./config.ts";

interface IssueNodeStub {
  id: string;
  identifier: string;
  title: string;
  description?: string | undefined;
  updatedAt: string;
  state?: { id: string; name: string } | null;
  team?: { id: string; key: string } | null;
  assignee?: { name: string } | null;
  children?: { nodes: unknown[] };
  labels?: { nodes: { name: string }[] };
  inverseRelations?: {
    nodes: {
      type: string;
      issue?: {
        identifier: string;
        title: string;
        state?: { name: string } | null;
      } | null;
    }[];
    pageInfo: { hasNextPage: boolean };
  };
}

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    linear: {
      projectSlug: "ai-strategy-aaaaaaaaaaaa",
      slugId: "aaaaaaaaaaaa",
      statuses: { todo: "Todo", inProgress: "In Progress", done: "Done", terminal: ["Done"] },
      ...overrides.linear,
    },
    git: { remote: "origin", defaultBranch: "main", ...overrides.git },
    workspace: {
      projectDir: "/work",
      knownRepositories: ["repo-a", "repo-b", "api", "api-admin"],
      ...overrides.workspace,
    },
    orchestrator: {
      maximumInProgress: 2,
      pollIntervalMilliseconds: 1000,
      sessionLimitPercentage: 85,
      ...overrides.orchestrator,
    },
    models: {
      default: "claude",
      isolation: "auto",
      definitions: {
        claude: { cmd: "claude", color: "#fff" },
        codex: { cmd: "codex", color: "#000" },
      },
      ...overrides.models,
    },
    prompts: { initial: "x", ...overrides.prompts },
    workspaceKind: overrides.workspaceKind ?? "auto",
    logging: { file: "/tmp/groundcrew-test.log", ...overrides.logging },
  };
}

function issueNode(overrides: Partial<IssueNodeStub>): IssueNodeStub {
  return {
    id: overrides.id ?? "uuid-1",
    identifier: overrides.identifier ?? "TEAM-1",
    title: overrides.title ?? "Title",
    description: "description" in overrides ? overrides.description : "Touches repo-a.",
    updatedAt: overrides.updatedAt ?? "2025-01-01T00:00:00.000Z",
    state: overrides.state === undefined ? { id: "state-todo", name: "Todo" } : overrides.state,
    team: overrides.team === undefined ? { id: "team-default", key: "TEAM" } : overrides.team,
    assignee: overrides.assignee === undefined ? { name: "Alice" } : overrides.assignee,
    children: overrides.children ?? { nodes: [] },
    labels: overrides.labels ?? { nodes: [] },
    ...(overrides.inverseRelations === undefined
      ? {}
      : { inverseRelations: overrides.inverseRelations }),
  };
}

function blockingRelation(
  identifier: string,
  status?: string,
): NonNullable<IssueNodeStub["inverseRelations"]>["nodes"][number] {
  return {
    type: "blocks",
    issue: {
      identifier,
      title: "Blocker",
      state: status === undefined ? null : { name: status },
    },
  };
}

type RawRequest = (query: string, variables?: Record<string, unknown>) => Promise<unknown>;

interface ClientStub {
  client: { rawRequest: ReturnType<typeof vi.fn<RawRequest>> };
}

function makeClient(options: { projectFound?: boolean; pages?: IssueNodeStub[][] }): ClientStub {
  const { projectFound = true, pages = [[]] } = options;
  let boardCallIndex = 0;
  const rawRequest = vi.fn<RawRequest>(async (query: string) => {
    if (query.includes("VerifyProject")) {
      return {
        data: {
          projects: {
            nodes: projectFound ? [{ id: "p1", name: "AI Strategy", slugId: "aaaaaaaaaaaa" }] : [],
          },
        },
      };
    }
    if (query.includes("BoardIssues")) {
      const index = boardCallIndex;
      boardCallIndex += 1;
      const page = pages[index] ?? [];
      const hasNext = index < pages.length - 1;
      return {
        data: {
          issues: {
            nodes: page,
            pageInfo: { hasNextPage: hasNext, endCursor: hasNext ? `cursor-${index}` : "" },
          },
        },
      };
    }
    return { data: {} };
  });
  return { client: { rawRequest } };
}

function makeBoardSource(
  client: ClientStub,
  config: ResolvedConfig = makeConfig(),
): {
  source: ReturnType<typeof createBoardSource>;
  rawRequest: ClientStub["client"]["rawRequest"];
} {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- tests hit the LinearClient surface consumed by boardSource
  const source = createBoardSource({ config, client: client as unknown as LinearClient });
  return { source, rawRequest: client.client.rawRequest };
}

describe(createBoardSource, () => {
  let consoleLog: ConsoleCapture;

  beforeEach(() => {
    consoleLog = captureConsoleLog();
  });

  afterEach(() => {
    consoleLog.restore();
    vi.clearAllMocks();
  });

  describe("verify", () => {
    it("rejects when no project matches the configured slugId", async () => {
      const { source } = makeBoardSource(makeClient({ projectFound: false }));
      await expect(source.verify()).rejects.toThrow(/No Linear project found/);
    });

    it("logs the resolved project name on success", async () => {
      const { source } = makeBoardSource(makeClient({ projectFound: true }));
      await source.verify();
      expect(consoleLog.output()).toContain("Resolved Linear project: AI Strategy");
    });
  });

  describe("fetch", () => {
    it("returns an empty board when the project has no issues", async () => {
      const { source } = makeBoardSource(makeClient({ pages: [[]] }));
      const state = await source.fetch();
      expect(state.issues).toStrictEqual([]);
      expectTypeOf(state.timestamp).toBeString();
    });

    it("paginates across multiple pages", async () => {
      const { source } = makeBoardSource(
        makeClient({
          pages: [
            [issueNode({ identifier: "TEAM-1", id: "uuid-1" })],
            [issueNode({ identifier: "TEAM-2", id: "uuid-2" })],
          ],
        }),
      );
      const state = await source.fetch();
      expect(state.issues.map((index) => index.id)).toStrictEqual(["team-1", "team-2"]);
    });

    it("filters out parent issues that have children", async () => {
      const { source } = makeBoardSource(
        makeClient({
          pages: [
            [
              issueNode({ identifier: "TEAM-1", id: "uuid-1", children: { nodes: [{ id: "c" }] } }),
              issueNode({ identifier: "TEAM-2", id: "uuid-2" }),
            ],
          ],
        }),
      );
      const state = await source.fetch();
      expect(state.issues.map((index) => index.id)).toStrictEqual(["team-2"]);
    });

    it("lowercases Linear's uppercase identifier into Issue.id", async () => {
      const { source } = makeBoardSource(
        makeClient({ pages: [[issueNode({ identifier: "STAFF-508", id: "uuid-staff" })]] }),
      );
      const state = await source.fetch();
      expect(state.issues[0]?.id).toBe("staff-508");
    });

    it("infers the repository from a known repo name in the description", async () => {
      const { source } = makeBoardSource(
        makeClient({
          pages: [[issueNode({ description: "Affects api-admin somewhere." })]],
        }),
      );
      const state = await source.fetch();
      const [first] = state.issues;
      expect(first?.repository).toBe("api-admin");
    });

    it("longer repository names beat shorter ones (api-admin vs api)", async () => {
      // Without the descending-length sort, `api` would match first.
      const { source } = makeBoardSource(
        makeClient({
          pages: [[issueNode({ description: "ticket about api-admin only" })]],
        }),
      );
      const state = await source.fetch();
      const [first] = state.issues;
      expect(first?.repository).toBe("api-admin");
    });

    it("rejects when no known repo appears in the description", async () => {
      const { source } = makeBoardSource(
        makeClient({ pages: [[issueNode({ description: "no repo here" })]] }),
      );

      await expect(source.fetch()).rejects.toThrow(
        /No known repository found in ticket TEAM-1 description/,
      );
    });

    it("rejects when description is missing", async () => {
      const { source } = makeBoardSource(
        makeClient({ pages: [[issueNode({ description: undefined })]] }),
      );

      await expect(source.fetch()).rejects.toThrow(
        /No known repository found in ticket TEAM-1 description/,
      );
    });

    it("scopes the board query to the orchestrator's configured state names so off-board tickets are never returned", async () => {
      const { source, rawRequest } = makeBoardSource(makeClient({ pages: [[]] }));

      await source.fetch();

      const boardCall = rawRequest.mock.calls.find(([query]) => query.includes("BoardIssues"));
      expect(boardCall?.[0]).toMatch(/state:\s*\{\s*name:\s*\{\s*in:\s*\$stateNames\s*\}\s*\}/);
      expect(boardCall?.[1]).toMatchObject({
        stateNames: ["Todo", "In Progress", "Done"],
      });
    });

    it("dedupes overlapping terminal state names in the query variables", async () => {
      const config = makeConfig({
        linear: {
          projectSlug: "ai-strategy-aaaaaaaaaaaa",
          slugId: "aaaaaaaaaaaa",
          // Done appears in both `done` and `terminal`; "Won't Do" is a custom
          // terminal state. The query should carry each name exactly once.
          statuses: {
            todo: "Todo",
            inProgress: "In Progress",
            done: "Done",
            terminal: ["Done", "Won't Do"],
          },
        },
      });
      const { source, rawRequest } = makeBoardSource(makeClient({ pages: [[]] }), config);

      await source.fetch();

      const boardCall = rawRequest.mock.calls.find(([query]) => query.includes("BoardIssues"));
      expect(boardCall?.[1]).toMatchObject({
        stateNames: ["Todo", "In Progress", "Done", "Won't Do"],
      });
    });

    it("resolves the model from an agent-* label", async () => {
      const { source } = makeBoardSource(
        makeClient({
          pages: [[issueNode({ labels: { nodes: [{ name: "agent-codex" }] } })]],
        }),
      );
      const state = await source.fetch();
      const [first] = state.issues;
      expect(first?.model).toBe("codex");
    });

    it("preserves agent-any as the model name (resolution happens later)", async () => {
      const { source } = makeBoardSource(
        makeClient({
          pages: [[issueNode({ labels: { nodes: [{ name: "agent-any" }] } })]],
        }),
      );
      const state = await source.fetch();
      const [first] = state.issues;
      expect(first?.model).toBe("any");
    });

    it("falls back to the default model when the label names an unknown model", async () => {
      const { source } = makeBoardSource(
        makeClient({
          pages: [[issueNode({ labels: { nodes: [{ name: "agent-ghost" }] } })]],
        }),
      );
      const state = await source.fetch();
      const [first] = state.issues;
      expect(first?.model).toBe("claude");
    });

    it("uses the default model when no agent-* label exists", async () => {
      const { source } = makeBoardSource(
        makeClient({
          pages: [[issueNode({ labels: { nodes: [{ name: "feature" }] } })]],
        }),
      );
      const state = await source.fetch();
      const [first] = state.issues;
      expect(first?.model).toBe("claude");
    });

    it("falls back to defaults when state, team, and assignee are missing", async () => {
      const { source } = makeBoardSource(
        makeClient({
          pages: [[issueNode({ state: null, team: null, assignee: null })]],
        }),
      );
      const state = await source.fetch();
      const [first] = state.issues;
      expect(first?.status).toBe("Unknown");
      expect(first?.statusId).toBe("");
      expect(first?.teamId).toBe("");
      expect(first?.assignee).toBe("Unassigned");
    });

    it("builds blockers only from `blocks` relations and ignores other relation types", async () => {
      const { source } = makeBoardSource(
        makeClient({
          pages: [
            [
              issueNode({
                inverseRelations: {
                  nodes: [
                    blockingRelation("TEAM-0", "In Progress"),
                    {
                      type: "relates",
                      issue: {
                        identifier: "TEAM-9",
                        title: "Related",
                        state: { name: "Done" },
                      },
                    },
                  ],
                  pageInfo: { hasNextPage: false },
                },
              }),
            ],
          ],
        }),
      );
      const state = await source.fetch();
      const [first] = state.issues;
      expect(first?.blockers).toStrictEqual([
        { id: "team-0", title: "Blocker", status: "In Progress" },
      ]);
      expect(first?.hasMoreBlockers).toBe(false);
    });

    it("represents missing blocker payloads as `unknown` with no status", async () => {
      const { source } = makeBoardSource(
        makeClient({
          pages: [
            [
              issueNode({
                inverseRelations: {
                  nodes: [{ type: "blocks", issue: null }],
                  pageInfo: { hasNextPage: false },
                },
              }),
            ],
          ],
        }),
      );
      const state = await source.fetch();
      const [first] = state.issues;
      expect(first?.blockers).toStrictEqual([{ id: "unknown", title: "", status: undefined }]);
    });

    it("propagates hasMoreBlockers when the relation page is paginated", async () => {
      const { source } = makeBoardSource(
        makeClient({
          pages: [
            [
              issueNode({
                inverseRelations: {
                  nodes: [],
                  pageInfo: { hasNextPage: true },
                },
              }),
            ],
          ],
        }),
      );
      const state = await source.fetch();
      const [first] = state.issues;
      expect(first?.hasMoreBlockers).toBe(true);
    });
  });
});

describe(isTerminalStatus, () => {
  it("returns true for a configured terminal status", () => {
    const config = makeConfig({
      linear: {
        projectSlug: "x-aaaaaaaaaaaa",
        slugId: "aaaaaaaaaaaa",
        statuses: { todo: "Todo", inProgress: "In Progress", done: "Done", terminal: ["Done"] },
      },
    });
    expect(isTerminalStatus("Done", config)).toBe(true);
  });

  it("returns true for any status in the terminal list", () => {
    const config = makeConfig({
      linear: {
        projectSlug: "x-aaaaaaaaaaaa",
        slugId: "aaaaaaaaaaaa",
        statuses: {
          todo: "Todo",
          inProgress: "In Progress",
          done: "Done",
          terminal: ["Done", "Released"],
        },
      },
    });
    expect(isTerminalStatus("Released", config)).toBe(true);
  });

  it("returns false for non-terminal statuses", () => {
    const config = makeConfig();
    expect(isTerminalStatus("Todo", config)).toBe(false);
    expect(isTerminalStatus("In Progress", config)).toBe(false);
  });
});
