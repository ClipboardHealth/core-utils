#!/usr/bin/env node
import { spawnSync, type SpawnSyncReturns } from "node:child_process";

function runGh(args: readonly string[], timeout?: number): SpawnSyncReturns<string> {
  return spawnSync("gh", args, { encoding: "utf8", timeout });
}

const NITPICK_SECTION_MARKER = "Nitpick comments";

const NITPICK_SECTION_REGEX =
  /<summary>🧹 Nitpick comments \(\d+\)<\/summary>\s*<blockquote>([\s\S]*?)<\/blockquote>\s*<\/details>\s*<details>\s*<summary>📜 Review details/i;

const FILE_SECTION_REGEX =
  /<details>\s*<summary>([^<]+\.[^<]+)\s+\(\d+\)<\/summary>\s*<blockquote>([\s\S]*?)<\/blockquote>\s*<\/details>/g;

const COMMENT_REGEX =
  /`(\d+(?:-\d+)?)`:\s*\*\*([^*]+)\*\*\s*([\s\S]*?)(?=---|\n`\d|<\/details>|$)/g;

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

interface Review {
  author: { login: string } | null;
  body: string;
  createdAt: string;
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

interface NitpickComment {
  author: string;
  body: string;
  createdAt: string;
  file: string;
  line: string;
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
  return runGh(["--version"]).status === 0;
}

function isGhAuthenticated(): boolean {
  return runGh(["auth", "status"]).status === 0;
}

function getPrNumberFromCurrentBranch(): number | undefined {
  const result = runGh(["pr", "view", "--json", "number"], 10_000);
  if (result.status !== 0) {
    return undefined;
  }

  const parsed = JSON.parse(result.stdout.trim()) as { number: number };
  return parsed.number;
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
  const result = runGh(["repo", "view", "--json", "owner,name"], 10_000);
  if (result.status !== 0) {
    outputError("Could not determine repository. Are you in a git repo with a GitHub remote?");
  }

  const parsed = JSON.parse(result.stdout.trim()) as { name: string; owner: { login: string } };
  return { name: parsed.name, owner: parsed.owner.login };
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

function cleanCommentBody(body: string): string {
  return body
    .replaceAll(/<details>[\s\S]*?<\/details>/g, "")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .trim();
}

function parseCommentsFromFileSection(
  fileContent: string,
  fileName: string,
  review: Review,
): NitpickComment[] {
  return [...fileContent.matchAll(COMMENT_REGEX)].map((match) => {
    const lineRange = match[1];
    const title = match[2].trim();
    const cleanBody = cleanCommentBody(match[3].trim());

    return {
      author: review.author?.login ?? "deleted-user",
      body: `${title}\n\n${cleanBody}`,
      createdAt: review.createdAt,
      file: fileName,
      line: lineRange,
    };
  });
}

function extractNitpicksFromReview(review: Review): NitpickComment[] {
  if (!review.body.includes(NITPICK_SECTION_MARKER)) {
    return [];
  }

  const nitpickSectionMatch = NITPICK_SECTION_REGEX.exec(review.body);
  if (!nitpickSectionMatch) {
    return [];
  }

  const nitpickSection = nitpickSectionMatch[1];
  const fileSections = [...nitpickSection.matchAll(FILE_SECTION_REGEX)];

  return fileSections.flatMap((fileMatch) => {
    const fileName = fileMatch[1].trim();
    const fileContent = fileMatch[2];
    return parseCommentsFromFileSection(fileContent, fileName, review);
  });
}

function extractNitpickComments(reviews: Review[]): NitpickComment[] {
  return reviews.flatMap(extractNitpicksFromReview);
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

  const repository = response.data.repository;
  if (!repository) {
    outputError(`Repository ${owner}/${repo} not found or not accessible.`);
  }

  const pr = repository.pullRequest;
  if (!pr) {
    outputError(`PR #${prNumber} not found or not accessible.`);
  }

  const unresolvedThreads = pr.reviewThreads.nodes.filter((thread) => !thread.isResolved);
  const unresolvedComments = unresolvedThreads.flatMap((thread) =>
    thread.comments.nodes.map(formatComment),
  );
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
