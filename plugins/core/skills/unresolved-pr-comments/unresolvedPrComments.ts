#!/usr/bin/env node
import { outputError, runGh, validatePrerequisites } from "../../lib/ghClient.ts";

import {
  extractCodeScanningAlertNumber,
  extractNitpickComments,
  type NitpickComment,
  type Review,
} from "./parseNitpicks.ts";

// Pagination limits: 100 review threads, 10 comments per thread, 100 reviews.
// Sufficient for typical PRs; data may be truncated on exceptionally active PRs.
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
      reviews(first: 100) {
        nodes {
          body
          author { login }
          createdAt
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
        reviews: { nodes: Review[] };
        title: string;
        url: string;
      } | null;
    } | null;
  };
}

interface UnresolvedComment {
  author: string;
  body: string;
  createdAt: string;
  file: string;
  line: number | null;
}

interface CodeScanningInstance {
  state: string;
}

interface CodeScanningAlert {
  most_recent_instance: CodeScanningInstance;
}

interface OutputResult {
  nitpickComments: NitpickComment[];
  owner: string;
  prNumber: number;
  repo: string;
  title: string;
  totalNitpicks: number;
  totalUnresolvedComments: number;
  unresolvedComments: UnresolvedComment[];
  url: string;
}

interface RepoInfo {
  name: string;
  owner: string;
}

function isCodeScanningAlertFixed(owner: string, repo: string, alertNumber: number): boolean {
  const result = runGh(["api", `repos/${owner}/${repo}/code-scanning/alerts/${alertNumber}`]);
  if (result.status !== 0) {
    return false;
  }

  try {
    const alert = JSON.parse(result.stdout) as CodeScanningAlert;
    return alert.most_recent_instance.state === "fixed";
  } catch {
    return false;
  }
}

function getPrNumberFromCurrentBranch(): number | undefined {
  const result = runGh(["pr", "view", "--json", "number"]);
  if (result.status !== 0) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(result.stdout.trim()) as { number: number };
    return parsed.number;
  } catch {
    return undefined;
  }
}

function getPrNumber(prNumberArg: string | undefined): number {
  if (prNumberArg) {
    if (!/^\d+$/.test(prNumberArg)) {
      outputError(`Invalid PR number: ${prNumberArg}`);
    }
    return Number.parseInt(prNumberArg, 10);
  }

  const prNumber = getPrNumberFromCurrentBranch();
  if (!prNumber) {
    outputError("No PR found for current branch. Provide PR number as argument.");
  }

  return prNumber;
}

function getRepoInfo(): RepoInfo {
  const result = runGh(["repo", "view", "--json", "owner,name"]);
  if (result.status !== 0) {
    outputError("Could not determine repository. Are you in a git repo with a GitHub remote?");
  }

  try {
    const parsed = JSON.parse(result.stdout.trim()) as { name: string; owner: { login: string } };
    return { name: parsed.name, owner: parsed.owner.login };
  } catch {
    outputError("Failed to parse repository info from gh CLI output.");
  }
}

function executeGraphQLQuery(owner: string, repo: string, prNumber: number): GraphQLResponse {
  const result = runGh([
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
  ]);

  if (result.status !== 0) {
    outputError(`GraphQL query failed: ${result.stderr}`);
  }

  try {
    return JSON.parse(result.stdout) as GraphQLResponse;
  } catch {
    outputError(`Failed to parse GraphQL response: ${result.stdout.slice(0, 200)}`);
  }
}

function formatComment(comment: Comment): UnresolvedComment {
  return {
    author: comment.author?.login ?? "deleted-user",
    body: comment.body,
    createdAt: comment.createdAt,
    file: comment.path,
    line: comment.line ?? comment.originalLine,
  };
}

function isUnresolvedSecurityComment(
  comment: UnresolvedComment,
  owner: string,
  repo: string,
): boolean {
  if (comment.author !== "github-advanced-security") {
    return true;
  }

  const alertNumber = extractCodeScanningAlertNumber(comment.body);
  if (!alertNumber) {
    return true;
  }

  return !isCodeScanningAlertFixed(owner, repo, alertNumber);
}

function main(): void {
  validatePrerequisites();

  const prNumber = getPrNumber(process.argv[2]);
  const { name: repo, owner } = getRepoInfo();
  const response = executeGraphQLQuery(owner, repo, prNumber);

  const repository = response.data.repository;
  if (!repository) {
    outputError(`Repository ${owner}/${repo} not found or not accessible.`);
  }

  const pr = repository.pullRequest;
  if (!pr) {
    outputError(`PR #${prNumber} not found or not accessible.`);
  }

  const unresolvedComments = pr.reviewThreads.nodes
    .filter((thread) => !thread.isResolved)
    .flatMap((thread) => thread.comments.nodes.map(formatComment))
    .filter((comment) => isUnresolvedSecurityComment(comment, owner, repo));

  const nitpickComments = extractNitpickComments(pr.reviews.nodes);

  const output: OutputResult = {
    nitpickComments,
    owner,
    prNumber,
    repo,
    title: pr.title,
    totalNitpicks: nitpickComments.length,
    totalUnresolvedComments: unresolvedComments.length,
    unresolvedComments,
    url: pr.url,
  };

  console.log(JSON.stringify(output, undefined, 2));
}

main();
