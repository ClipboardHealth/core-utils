#!/usr/bin/env node
// Get unresolved review comments from a GitHub pull request
import { execSync, spawnSync } from "node:child_process";

const GRAPHQL_QUERY = `
query($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      title
      url
      reviewThreads(first: 100) {
        nodes {
          isResolved
          comments(first: 10) {
            nodes {
              body
              path
              line
              originalLine
              author { login }
              createdAt
            }
          }
        }
      }
    }
  }
}`;

interface Comment {
  author: { login: string } | null;
  body: string;
  createdAt: string;
  line: number | null;
  originalLine: number | null;
  path: string;
}

interface ReviewThread {
  comments: { nodes: Comment[] };
  isResolved: boolean;
}

interface GraphQLResponse {
  data: {
    repository: {
      pullRequest: {
        reviewThreads: { nodes: ReviewThread[] };
        title: string;
        url: string;
      } | null;
    };
  };
}

interface UnresolvedComment {
  author: string;
  body: string;
  created_at: string;
  file: string;
  line: number | null;
}

interface OutputResult {
  owner: string;
  pr_number: number;
  repo: string;
  title: string;
  total_unresolved: number;
  unresolved_threads: UnresolvedComment[];
  url: string;
}

interface ErrorResult {
  error: string;
}

interface RepoInfo {
  name: string;
  owner: string;
}

function outputError(message: string): never {
  const result: ErrorResult = { error: message };
  console.log(JSON.stringify(result));
  process.exit(1);
}

function isGhCliInstalled(): boolean {
  const result = spawnSync("which", ["gh"], { encoding: "utf8" });
  return result.status === 0;
}

function isGhAuthenticated(): boolean {
  const result = spawnSync("gh", ["auth", "status"], { encoding: "utf8" });
  return result.status === 0;
}

function getPrNumberFromCurrentBranch(): number | undefined {
  try {
    const prJson = execSync("gh pr view --json number", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    const parsed = JSON.parse(prJson) as { number: number };
    return parsed.number;
  } catch {
    return undefined;
  }
}

function parsePrNumberArg(arg: string): number {
  if (!/^\d+$/.test(arg)) {
    outputError(`Invalid PR number: ${arg}`);
  }
  return Number.parseInt(arg, 10);
}

function getPrNumber(prNumberArg: string | undefined): number {
  if (prNumberArg) {
    return parsePrNumberArg(prNumberArg);
  }

  const prNumber = getPrNumberFromCurrentBranch();
  if (!prNumber) {
    outputError("No PR found for current branch. Provide PR number as argument.");
  }

  return prNumber;
}

function getRepoInfo(): RepoInfo {
  try {
    const repoJson = execSync("gh repo view --json owner,name", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    const parsed = JSON.parse(repoJson) as { name: string; owner: { login: string } };
    return { name: parsed.name, owner: parsed.owner.login };
  } catch {
    outputError("Could not determine repository. Are you in a git repo with a GitHub remote?");
  }
}

function executeGraphQLQuery(owner: string, repo: string, prNumber: number): GraphQLResponse {
  const result = spawnSync(
    "gh",
    [
      "api",
      "graphql",
      "-f",
      `query=${GRAPHQL_QUERY}`,
      "-f",
      `owner=${owner}`,
      "-f",
      `repo=${repo}`,
      "-F",
      `pr=${prNumber}`,
    ],
    { encoding: "utf8" },
  );

  if (result.status !== 0) {
    outputError(`GraphQL query failed: ${result.stderr}`);
  }

  return JSON.parse(result.stdout) as GraphQLResponse;
}

function formatComment(comment: Comment): UnresolvedComment {
  return {
    author: comment.author?.login ?? "deleted-user",
    body: comment.body,
    created_at: comment.createdAt,
    file: comment.path,
    line: comment.line ?? comment.originalLine,
  };
}

function extractUnresolvedComments(threads: ReviewThread[]): UnresolvedComment[] {
  return threads
    .filter((thread) => !thread.isResolved)
    .flatMap((thread) => thread.comments.nodes.map(formatComment));
}

function validatePrerequisites(): void {
  if (!isGhCliInstalled()) {
    outputError("gh CLI not found. Install from https://cli.github.com");
  }

  if (!isGhAuthenticated()) {
    outputError("Not authenticated with GitHub. Run: gh auth login");
  }
}

function main(): void {
  validatePrerequisites();

  const prNumber = getPrNumber(process.argv[2]);
  const { name: repo, owner } = getRepoInfo();
  const response = executeGraphQLQuery(owner, repo, prNumber);

  const pr = response.data.repository.pullRequest;
  if (!pr) {
    outputError(`PR #${prNumber} not found or not accessible.`);
  }

  const unresolvedThreads = pr.reviewThreads.nodes.filter((thread) => !thread.isResolved);
  const unresolvedComments = extractUnresolvedComments(pr.reviewThreads.nodes);

  const output: OutputResult = {
    owner,
    pr_number: prNumber,
    repo,
    title: pr.title,
    total_unresolved: unresolvedThreads.length,
    unresolved_threads: unresolvedComments,
    url: pr.url,
  };

  console.log(JSON.stringify(output, undefined, 2));
}

main();
