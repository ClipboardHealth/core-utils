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

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
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

function log(message: string): void {
  console.log(message);
}

function verbose(message: string): void {
  if (isVerbose) {
    console.log(message);
  }
}

async function createGitHubRelease(
  owner: string,
  repo: string,
  token: string,
  tag: string,
  body: string,
  commitSha: string,
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // oxlint-disable-next-line no-await-in-loop
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
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
      const errorBody = (await response.json()) as { errors?: Array<{ code?: string }> };
      const alreadyExists = errorBody.errors?.some((e) => e.code === "already_exists");
      if (alreadyExists) {
        verbose(`  Release for ${tag} already exists, updating...`);
        // oxlint-disable-next-line no-await-in-loop
        await updateExistingRelease(owner, repo, token, tag, body);
        return;
      }
      throw new Error(`GitHub API 422: ${JSON.stringify(errorBody)}`);
    }

    if (RETRYABLE_STATUS_CODES.has(response.status)) {
      const backoffMs = INITIAL_BACKOFF_MS * 2 ** (attempt - 1);
      console.warn(
        `  GitHub API returned ${response.status} for ${tag} (attempt ${attempt}/${MAX_RETRIES}), retrying in ${backoffMs}ms...`,
      );
      if (attempt < MAX_RETRIES) {
        // oxlint-disable-next-line no-await-in-loop
        await sleep(backoffMs);
        continue;
      }
      throw new Error(
        `GitHub API returned ${response.status} after ${MAX_RETRIES} attempts for ${tag}`,
      );
    }

    // oxlint-disable-next-line no-await-in-loop
    const text = await response.text();
    throw new Error(`GitHub API returned ${response.status}: ${text}`);
  }
}

async function updateExistingRelease(
  owner: string,
  repo: string,
  token: string,
  tag: string,
  body: string,
): Promise<void> {
  const getResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!getResponse.ok) {
    throw new Error(`Failed to fetch existing release for ${tag}: ${getResponse.status}`);
  }

  const release = (await getResponse.json()) as { id: number };
  const patchResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/releases/${release.id}`,
    {
      method: "PATCH",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ body }),
    },
  );

  if (!patchResponse.ok) {
    const text = await patchResponse.text();
    throw new Error(
      `Failed to update existing release for ${tag}: ${patchResponse.status} ${text}`,
    );
  }

  verbose(`  Updated existing release for ${tag}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
  // Suppress duplicate filter output (matching release.js behavior)
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
    // Commit with multiple --message flags to match Nx's format
    const messageArgs = commitMessages.flatMap((msg) => ["--message", msg]);
    execFileSync("git", ["commit", "--allow-empty", ...messageArgs, "--no-verify"], {
      stdio: "inherit",
    });

    // Create annotated tags
    for (const tag of tags) {
      execFileSync("git", ["tag", "-a", tag, "-m", tag], { stdio: "inherit" });
    }

    // Push commit and tags atomically
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
    const { releaseVersion: rv, contents } = changelog;
    const versionData = projectsVersionData[projectName];
    if (!versionData?.newVersion) {
      continue;
    }

    const tag = rv.gitTag;
    if (isDryRun) {
      log(`  [dry-run] Would create GitHub release for ${tag}`);
      continue;
    }

    try {
      log(`  Creating release for ${tag}...`);
      // oxlint-disable-next-line no-await-in-loop
      await createGitHubRelease(owner, repo, ghToken, tag, contents, commitSha);
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
