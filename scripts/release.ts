/**
 * Programmatic release script that separates versioning, changelog generation,
 * git operations, and GitHub release creation into distinct phases. This allows
 * retry logic around GitHub release creation, which prevents the need for manual
 * intervention when the GitHub API returns transient errors (e.g. 502).
 *
 * Replaces: npx nx release --skip-publish
 *
 * @see https://nx.dev/recipes/nx-release/programmatic-api
 */
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";

import { releaseChangelog, releaseVersion } from "nx/release";

const MAX_RETRY_COUNT = 3;
const INITIAL_BACKOFF_MILLISECONDS = 1000;
const RETRYABLE_STATUS_CODES = new Set([500, 502, 503, 504]);

const { values: flags } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    verbose: { type: "boolean", default: false },
  },
  strict: true,
});

const isDryRun = flags["dry-run"] ?? false;
const isVerbose = flags.verbose ?? false;

interface GitHubReleaseFailure {
  project: string;
  tag: string;
  error: string;
}

interface GitHubReleaseRequest {
  owner: string;
  repo: string;
  token: string;
  tag: string;
  body: string;
  commitSha: string;
}

interface GitHubReleaseResponse {
  id: number;
}

function log(message: string): void {
  console.log(message);
}

function verbose(message: string): void {
  if (isVerbose) {
    console.log(message);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function resolveGitHubRepo(): { owner: string; repo: string } {
  const remoteUrl = execFileSync("git", ["remote", "get-url", "origin"], {
    encoding: "utf8",
  }).trim();

  const match = remoteUrl.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
  if (!match) {
    throw new Error(`Could not parse GitHub owner/repo from remote URL: ${remoteUrl}`);
  }

  return { owner: match[1], repo: match[2] };
}

function gitHubHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function gitHubReleasesUrl(owner: string, repo: string): string {
  return `https://api.github.com/repos/${owner}/${repo}/releases`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isGitHubReleaseResponse(value: unknown): value is GitHubReleaseResponse {
  return isRecord(value) && typeof value.id === "number";
}

async function updateExistingRelease(
  request: Pick<GitHubReleaseRequest, "owner" | "repo" | "token" | "tag" | "body">,
): Promise<void> {
  const { owner, repo, token, tag, body } = request;

  const getResponse = await fetch(
    `${gitHubReleasesUrl(owner, repo)}/tags/${encodeURIComponent(tag)}`,
    { headers: gitHubHeaders(token) },
  );

  if (!getResponse.ok) {
    throw new Error(`Failed to fetch existing release for ${tag}: ${getResponse.status}`);
  }

  const releaseData: unknown = await getResponse.json();
  if (!isGitHubReleaseResponse(releaseData)) {
    throw new Error(`Unexpected release response shape for ${tag}`);
  }

  const patchResponse = await fetch(`${gitHubReleasesUrl(owner, repo)}/${releaseData.id}`, {
    method: "PATCH",
    headers: gitHubHeaders(token),
    body: JSON.stringify({ body }),
  });

  if (!patchResponse.ok) {
    throw new Error(`Failed to update existing release for ${tag}: ${patchResponse.status}`);
  }

  verbose(`  Updated existing release for ${tag}`);
}

async function createGitHubRelease(request: GitHubReleaseRequest): Promise<void> {
  const { owner, repo, token, tag, body, commitSha } = request;

  for (let attempt = 1; attempt <= MAX_RETRY_COUNT; attempt++) {
    // oxlint-disable-next-line no-await-in-loop
    const response = await fetch(gitHubReleasesUrl(owner, repo), {
      method: "POST",
      headers: gitHubHeaders(token),
      body: JSON.stringify({
        tag_name: tag,
        target_commitish: commitSha,
        name: tag,
        body,
      }),
    });

    if (response.ok) {
      verbose(`  Created release for ${tag}`);
      return;
    }

    // Handle "already exists" by updating the existing release (makes re-runs safe)
    if (response.status === 422) {
      // oxlint-disable-next-line no-await-in-loop
      const errorBody: unknown = await response.json();
      const alreadyExists =
        isRecord(errorBody) &&
        Array.isArray(errorBody.errors) &&
        errorBody.errors.some((entry) => isRecord(entry) && entry.code === "already_exists");
      if (alreadyExists) {
        verbose(`  Release for ${tag} already exists, updating...`);
        // oxlint-disable-next-line no-await-in-loop
        await updateExistingRelease({ owner, repo, token, tag, body });
        return;
      }

      throw new Error(`GitHub API returned 422 for ${tag}`);
    }

    if (!RETRYABLE_STATUS_CODES.has(response.status)) {
      throw new Error(`GitHub API returned ${response.status} for ${tag}`);
    }

    if (attempt === MAX_RETRY_COUNT) {
      throw new Error(
        `GitHub API returned ${response.status} after ${MAX_RETRY_COUNT} attempts for ${tag}`,
      );
    }

    const backoffMs = INITIAL_BACKOFF_MILLISECONDS * 2 ** (attempt - 1);
    console.warn(
      `  GitHub API returned ${response.status} for ${tag} (attempt ${attempt}/${MAX_RETRY_COUNT}), retrying in ${backoffMs}ms...`,
    );

    // oxlint-disable-next-line no-await-in-loop
    await sleep(backoffMs);
  }
}

async function main(): Promise<void> {
  // Phase 1: Version bumping
  log("Phase 1: Bumping versions...");
  const { projectsVersionData, releaseGraph } = await releaseVersion({
    dryRun: isDryRun,
    verbose: isVerbose,
    stageChanges: true,
    gitCommit: false,
    gitTag: false,
  });

  const changedProjects = Object.entries(projectsVersionData).filter(
    ([, data]) => data.newVersion !== null,
  );

  if (changedProjects.length === 0) {
    log("No new versions detected, exiting.");
    return;
  }

  log(`  ${changedProjects.length} project(s) with new versions`);
  for (const [name, data] of changedProjects) {
    verbose(`    ${name}: ${data.currentVersion} -> ${data.newVersion}`);
  }

  // Phase 2: Changelog generation
  log("Phase 2: Generating changelogs...");
  process.env.NX_RELEASE_INTERNAL_SUPPRESS_FILTER_LOG = "true";
  const { projectChangelogs } = await releaseChangelog({
    dryRun: isDryRun,
    verbose: isVerbose,
    versionData: projectsVersionData,
    releaseGraph,
    stageChanges: true,
    gitCommit: false,
    gitTag: false,
    gitPush: false,
    createRelease: false,
  });

  // Phase 3: Git commit, tag, push
  log("Phase 3: Git commit, tag, push...");

  const commitMessages = [
    "chore(release): publish [skip actions]",
    ...changedProjects.map(([name, data]) => `- project: ${name} ${data.newVersion}`),
  ];

  const tags = changedProjects.map(([name, data]) => `${name}@${data.newVersion}`);

  if (isDryRun) {
    log("  [dry-run] Would commit with messages:");
    for (const msg of commitMessages) {
      log(`    ${msg}`);
    }
    log("  [dry-run] Would create tags:");
    for (const tag of tags) {
      log(`    ${tag}`);
    }
    log("  [dry-run] Would push with --follow-tags --no-verify --atomic");
  } else {
    const messageArgs = commitMessages.flatMap((msg) => ["--message", msg]);
    execFileSync("git", ["commit", "--allow-empty", ...messageArgs, "--no-verify"], {
      stdio: "inherit",
    });

    for (const tag of tags) {
      execFileSync("git", ["tag", "-a", tag, "-m", tag], { stdio: "inherit" });
    }

    execFileSync("git", ["push", "--follow-tags", "--no-verify", "--atomic"], {
      stdio: "inherit",
    });
  }

  // Phase 4: GitHub releases with retry
  log("Phase 4: Creating GitHub releases...");
  const ghToken = process.env.GH_TOKEN;
  if (!ghToken) {
    console.warn("  GH_TOKEN not set, skipping GitHub release creation.");
    return;
  }

  if (!projectChangelogs) {
    log("  No project changelogs to create releases for.");
    return;
  }

  const { owner, repo } = resolveGitHubRepo();
  const commitSha = isDryRun
    ? "dry-run"
    : execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

  const failures: GitHubReleaseFailure[] = [];

  for (const [projectName, changelog] of Object.entries(projectChangelogs)) {
    const { releaseVersion: projectReleaseVersion, contents } = changelog;
    const versionData = projectsVersionData[projectName];
    if (!versionData?.newVersion) {
      continue;
    }

    const tag = projectReleaseVersion.gitTag;
    if (isDryRun) {
      log(`  [dry-run] Would create GitHub release for ${tag}`);
      continue;
    }

    try {
      log(`  Creating release for ${tag}...`);
      // oxlint-disable-next-line no-await-in-loop
      await createGitHubRelease({ owner, repo, token: ghToken, tag, body: contents, commitSha });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  Failed to create release for ${tag}: ${message}`);
      failures.push({ project: projectName, tag, error: message });
    }
  }

  if (failures.length > 0) {
    console.error(`\nFailed to create ${failures.length} GitHub release(s):`);
    for (const f of failures) {
      console.error(`  ${f.project} (${f.tag}): ${f.error}`);
    }
    process.exit(1);
  }

  log("Release complete.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
