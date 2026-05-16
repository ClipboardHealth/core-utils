/**
 * Linear adapter — turns the project's GraphQL state into a `BoardState`
 * snapshot. Owns the GraphQL queries and shape parsing so callers consume a
 * typed `BoardState` instead of raw nodes.
 */

import type { LinearClient } from "@linear/sdk";

import { AGENT_ANY_MODEL, type ResolvedConfig, type WorkspaceRunner } from "./config.ts";
import { log } from "./util.ts";

const AGENT_LABEL_PREFIX = "agent-";
const ISSUES_PAGE_SIZE = 250;

export interface Blocker {
  id: string;
  title: string;
  status: string | undefined;
}

export interface Issue {
  id: string;
  uuid: string;
  title: string;
  status: string;
  statusId: string;
  assignee: string;
  updatedAt: string;
  /** `undefined` when the ticket has no `agent-*` label — i.e. not groundcrew's concern. */
  repository: string | undefined;
  /** `undefined` when the ticket has no `agent-*` label — i.e. not groundcrew's concern. */
  model: string | undefined;
  /** `undefined` when the ticket has no `agent-*` label — i.e. not groundcrew's concern. */
  runner: WorkspaceRunner | undefined;
  teamId: string;
  blockers: Blocker[];
  hasMoreBlockers: boolean;
}

/**
 * `Issue` narrowed to "this ticket is for groundcrew" — produced by filtering
 * through `isGroundcrewIssue`. Use this type wherever downstream code reads
 * `model`/`repository` and the issue has already been through that filter.
 */
export type GroundcrewIssue = Issue & {
  model: string;
  repository: string;
  runner: WorkspaceRunner;
};

export function isGroundcrewIssue(issue: Issue): issue is GroundcrewIssue {
  return issue.model !== undefined && issue.repository !== undefined && issue.runner !== undefined;
}

export interface BoardState {
  timestamp: string;
  issues: Issue[];
}

export class RepositoryResolutionError extends Error {
  public constructor(arguments_: { ticket: string; repositories: readonly string[] }) {
    const { ticket, repositories } = arguments_;
    super(
      `No known repository found in ticket ${ticket} description. Add one of workspace.knownRepositories: ${repositories.join(", ")}`,
    );
    this.name = "RepositoryResolutionError";
  }
}

export interface BoardSource {
  /**
   * Look up the configured project and fail loudly if it isn't there. Run
   * once at startup so a misconfigured slug surfaces before the first tick.
   */
  verify(): Promise<void>;
  /** Fetch the current board snapshot. Paginates internally. */
  fetch(): Promise<BoardState>;
}

interface BoardSourceDeps {
  config: ResolvedConfig;
  client: LinearClient;
}

export function createBoardSource(deps: BoardSourceDeps): BoardSource {
  const { config, client } = deps;
  return {
    async verify() {
      await verifyProject(client, config);
    },
    async fetch() {
      return await fetchBoard(client, config);
    },
  };
}

export function isTerminalStatus(status: string, config: ResolvedConfig): boolean {
  return config.linear.statuses.terminal.includes(status);
}

interface IssueNode {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  updatedAt: string;
  state?: { id: string; name: string };
  team?: { id: string; key: string };
  assignee?: { name: string } | null;
  children: { nodes: unknown[] };
  labels: { nodes: { name: string }[] };
  inverseRelations?: {
    nodes: IssueRelationNode[];
    pageInfo: { hasNextPage: boolean };
  };
}

interface IssuesPage {
  nodes: IssueNode[];
  pageInfo: { hasNextPage: boolean; endCursor: string };
}

interface IssueRelationNode {
  type: string;
  issue?: {
    identifier: string;
    title: string;
    state?: { name: string } | null;
  } | null;
}

async function verifyProject(client: LinearClient, config: ResolvedConfig): Promise<void> {
  const response: { data?: unknown } = await client.client.rawRequest(
    `query VerifyProject($slugId: String!) {
      projects(filter: { slugId: { eq: $slugId } }, first: 1) {
        nodes { id name slugId }
      }
    }`,
    { slugId: config.linear.slugId },
  );
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- shape is fixed by our GraphQL query above
  const { projects } = response.data as {
    projects: { nodes: { id: string; name: string; slugId: string }[] };
  };
  const [project] = projects.nodes;
  if (!project) {
    throw new Error(
      `No Linear project found with slugId "${config.linear.slugId}" (linear.projectSlug = "${config.linear.projectSlug}"). Confirm the slug matches the trailing segment of your project's URL and that LINEAR_API_KEY can access this workspace.`,
    );
  }
  log(`Resolved Linear project: ${project.name} (slugId ${project.slugId})`);
}

async function fetchBoard(client: LinearClient, config: ResolvedConfig): Promise<BoardState> {
  const nodes: IssueNode[] = [];
  let after: string | null = null;
  // Two server-side filters narrow the response to tickets the orchestrator
  // can actually act on:
  //   1. State: only Todo (to dispatch), In-Progress (to count active
  //      capacity), Done + extra terminal states (to drive cleanup). Backlog,
  //      Triage, and custom columns are dropped server-side.
  //   2. Labels: at least one `agent-*` label — i.e. someone opted the ticket
  //      in to groundcrew. Without this, every human-owned ticket on a shared
  //      project would round-trip back just to be filtered out client-side.
  // The client-side `isGroundcrewIssue` guard in dispatcher.ts is now
  // belt-and-suspenders against query drift, not the load-bearing filter.
  const stateNames = [
    ...new Set([
      config.linear.statuses.todo,
      config.linear.statuses.inProgress,
      config.linear.statuses.done,
      ...config.linear.statuses.terminal,
    ]),
  ];

  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- pagination cursor depends on the previous response
    const response: { data?: unknown } = await client.client.rawRequest(
      `query BoardIssues($slugId: String!, $stateNames: [String!]!, $agentLabelPrefix: String!, $after: String) {
        issues(
          filter: {
            project: { slugId: { eq: $slugId } }
            state: { name: { in: $stateNames } }
            labels: { some: { name: { startsWith: $agentLabelPrefix } } }
          }
          first: ${ISSUES_PAGE_SIZE}
          after: $after
          includeArchived: false
        ) {
          nodes {
            id
            identifier
            title
            description
            updatedAt
            state { id name }
            team { id key }
            assignee { name }
            children { nodes { id } }
            labels {
              nodes {
                name
              }
            }
            inverseRelations(first: 50, includeArchived: false) {
              nodes {
                type
                issue {
                  identifier
                  title
                  state { name }
                }
              }
              pageInfo { hasNextPage }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      {
        slugId: config.linear.slugId,
        stateNames,
        agentLabelPrefix: AGENT_LABEL_PREFIX,
        after,
      },
    );

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- shape is fixed by our GraphQL query above
    const { issues: page } = response.data as { issues: IssuesPage };
    nodes.push(...page.nodes);
    if (!page.pageInfo.hasNextPage) {
      break;
    }
    after = page.pageInfo.endCursor;
  }

  const repositoryRegex = buildRepositoryRegex(config);

  // Only parse `repository` for tickets that opted in via an `agent-*` label.
  // Without this gate, a single human-owned ticket without a parseable repo
  // would abort the whole `crew run` before the Todo filter ever runs.
  const issues: Issue[] = nodes
    .filter((node) => node.children.nodes.length === 0)
    .map((node) => {
      const parsedAgentLabels = parseAgentLabels(node.labels.nodes, config);
      const repository =
        parsedAgentLabels === undefined
          ? undefined
          : parseRepository({
              description: node.description ?? undefined,
              config,
              repositoryRegex,
              ticket: node.identifier,
            });
      return {
        id: node.identifier.toLowerCase(),
        uuid: node.id,
        title: node.title,
        status: node.state?.name ?? "Unknown",
        statusId: node.state?.id ?? "",
        assignee: node.assignee?.name ?? "Unassigned",
        updatedAt: node.updatedAt,
        repository,
        model: parsedAgentLabels?.model,
        runner: parsedAgentLabels?.runner,
        teamId: node.team?.id ?? "",
        blockers: blockersFromRelations(node.inverseRelations?.nodes ?? []),
        hasMoreBlockers: node.inverseRelations?.pageInfo.hasNextPage ?? false,
      };
    });

  return { timestamp: new Date().toISOString(), issues };
}

function escapeRegex(value: string): string {
  return value.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);
}

// Sort by descending length so longer names match first — `api-admin`
// must beat `api` when both are configured. `\b` treats `-` as a word
// boundary, so without this ordering `api` would win on `api-admin`.
function buildRepositoryRegex(config: ResolvedConfig): RegExp {
  const alternation = config.workspace.knownRepositories
    .toSorted((a, b) => b.length - a.length)
    .map(escapeRegex)
    .join("|");
  return new RegExp(String.raw`\b(${alternation})\b`);
}

interface ResolvedIssue {
  title: string;
  description: string;
  repository: string;
  model: string;
  runner: WorkspaceRunner;
}

const ISSUE_LABEL_PAGE_SIZE = 50;

/**
 * `agent-any` collapses to `models.default` here — manual setup doesn't run
 * the usage-gated `any` resolver, so the caller gets a concrete model name
 * instead of a sentinel that downstream code can't interpret.
 */
export async function fetchResolvedIssue(arguments_: {
  client: LinearClient;
  config: ResolvedConfig;
  ticket: string;
}): Promise<ResolvedIssue> {
  const { client, config, ticket } = arguments_;
  const response: { data?: unknown } = await client.client.rawRequest(
    `query ResolveIssue($id: String!) {
      issue(id: $id) {
        title
        description
        labels(first: ${ISSUE_LABEL_PAGE_SIZE}) {
          nodes { name }
        }
      }
    }`,
    { id: ticket.toUpperCase() },
  );
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- shape is fixed by our GraphQL query above
  const { issue } = response.data as {
    issue: {
      title: string;
      description?: string | null;
      labels: { nodes: { name: string }[] };
    } | null;
  };
  if (issue === null) {
    throw new Error(`Ticket ${ticket.toUpperCase()} not found in Linear`);
  }
  const description = issue.description ?? "";
  const repository = parseRepository({
    description,
    config,
    repositoryRegex: buildRepositoryRegex(config),
    ticket: ticket.toUpperCase(),
  });
  // Manual setup is an explicit per-ticket opt-in by the user, so an
  // unlabeled ticket still resolves to `models.default` — different from
  // the auto-pickup path, where unlabeled tickets are ignored.
  const parsed = parseAgentLabels(issue.labels.nodes, config);
  const model =
    parsed === undefined || parsed.model === AGENT_ANY_MODEL ? config.models.default : parsed.model;
  const runner = parsed?.runner ?? "local";
  return { title: issue.title, description, repository, model, runner };
}

interface ParseRepositoryArguments {
  description: string | undefined;
  config: ResolvedConfig;
  repositoryRegex: RegExp;
  ticket: string;
}

function parseRepository(arguments_: ParseRepositoryArguments): string {
  const { description, config, repositoryRegex, ticket } = arguments_;
  if (description === undefined || description.length === 0) {
    throw new RepositoryResolutionError({
      ticket,
      repositories: config.workspace.knownRepositories,
    });
  }
  const repository = repositoryRegex.exec(description)?.[1];
  if (repository === undefined) {
    throw new RepositoryResolutionError({
      ticket,
      repositories: config.workspace.knownRepositories,
    });
  }
  return repository;
}

/**
 * Returns the resolved agent metadata for a ticket, or `undefined` when the
 * ticket has no `agent-*` label — those tickets are not groundcrew's concern
 * and downstream code skips them. An explicit `agent-<unknown>` label still
 * falls back to `models.default` because the user opted in by labeling.
 */
interface ParsedAgentLabels {
  model: string;
  runner: WorkspaceRunner;
}

function parseAgentLabels(
  labels: { name: string }[],
  config: ResolvedConfig,
): ParsedAgentLabels | undefined {
  const agentLabels = labels.filter((label) => label.name.startsWith(AGENT_LABEL_PREFIX));
  if (agentLabels.length === 0) {
    return undefined;
  }
  const runner = agentLabels.some((label) => label.name === "agent-remote") ? "remote" : "local";
  for (const label of agentLabels) {
    if (label.name === "agent-remote") {
      continue;
    }
    const name = label.name.slice(AGENT_LABEL_PREFIX.length);
    if (name === AGENT_ANY_MODEL) {
      return { model: AGENT_ANY_MODEL, runner };
    }
    // Own-property check, not `in`: a label like `agent-toString` or
    // `agent-__proto__` would otherwise resolve through the prototype chain
    // instead of falling back to `models.default`.
    if (Object.hasOwn(config.models.definitions, name)) {
      return { model: name, runner };
    }
  }
  return { model: config.models.default, runner };
}

function blockersFromRelations(relations: IssueRelationNode[]): Blocker[] {
  return relations
    .filter((relation) => relation.type === "blocks")
    .map((relation) => ({
      id: relation.issue?.identifier?.toLowerCase() ?? "unknown",
      title: relation.issue?.title ?? "",
      status: relation.issue?.state?.name,
    }));
}
