import { outputError, runGh } from "./ghClient.ts";

export interface RepoInfo {
  owner: string;
  name: string;
}

/**
 * Get PR number from current branch's associated PR.
 * Returns undefined if no PR exists for the current branch.
 */
export function getPrNumberFromCurrentBranch(): number | undefined {
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

/**
 * Get PR number from argument or current branch.
 * Exits with error if no PR is found.
 */
export function getPrNumber(prNumberArg: string | undefined): number {
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

/**
 * Get repository owner and name from current git repository.
 * Exits with error if not in a git repo with GitHub remote.
 */
export function getRepoInfo(): RepoInfo {
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
