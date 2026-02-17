import { spawnSync, type SpawnSyncReturns } from "node:child_process";

interface ErrorResult {
  error: string;
}

export function runGh(args: readonly string[], timeout = 30_000): SpawnSyncReturns<string> {
  return spawnSync("gh", args, { encoding: "utf8", timeout });
}

export function runGit(args: readonly string[]): SpawnSyncReturns<string> {
  return spawnSync("git", args, { encoding: "utf8" });
}

export function getGitUserEmail(): string | undefined {
  const result = runGit(["config", "user.email"]);
  return result.status === 0 ? result.stdout.trim() : undefined;
}

export function outputError(message: string): never {
  const result: ErrorResult = { error: message };
  console.log(JSON.stringify(result));
  process.exit(1);
}

export function isGhCliInstalled(): boolean {
  return runGh(["--version"]).status === 0;
}

export function isGhAuthenticated(): boolean {
  // `gh auth status` returns non-zero when *any* stored account is invalid,
  // even if the active account (e.g. via GITHUB_TOKEN) works fine.
  // Use `gh api user` to verify actual API access instead.
  return runGh(["api", "user", "--jq", ".login"]).status === 0;
}

export function validatePrerequisites(): void {
  if (!isGhCliInstalled()) {
    outputError("gh CLI not found. Install from https://cli.github.com");
  }

  if (!isGhAuthenticated()) {
    outputError("Not authenticated with GitHub. Run: gh auth login");
  }
}

export function getCurrentUser(): string {
  const result = runGh(["api", "user", "--jq", ".login"]);
  if (result.status !== 0) {
    outputError("Failed to get current user. Ensure you are authenticated with gh auth login");
  }
  return result.stdout.trim();
}

export function executeGraphQL<T>(query: string, variables: Record<string, string | number>): T {
  const args = ["api", "graphql", "-f", `query=${query}`];

  for (const [key, value] of Object.entries(variables)) {
    if (typeof value === "number") {
      args.push("-F", `${key}=${value}`);
    } else {
      args.push("-f", `${key}=${value}`);
    }
  }

  const result = runGh(args);
  if (result.status !== 0) {
    outputError(`GraphQL query failed: ${result.stderr}`);
  }

  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    outputError(`Failed to parse GraphQL response: ${result.stdout.slice(0, 200)}`);
  }
}
