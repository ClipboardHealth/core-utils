import { execFileSync } from "node:child_process";

export type ReleasePushResult = "pushed" | "superseded";

/**
 * Pushes the release commit and its tags atomically; a tag that exists on the remote at another
 * object rejects the whole push. Returns "superseded" when the push failed because the remote
 * branch moved past the commit this release was computed from; nothing reached the remote then,
 * and a fresh run from the new tip must recompute versions. Rethrows any other push failure.
 */
export function pushRelease(input: {
  cwd: string;
  remote: string;
  branch: string;
  tags: readonly string[];
}): ReleasePushResult {
  const { cwd, remote, branch, tags } = input;
  try {
    execFileSync(
      "git",
      [
        "push",
        "--no-verify",
        "--atomic",
        remote,
        `HEAD:${branch}`,
        ...tags.map((tag) => `refs/tags/${tag}:refs/tags/${tag}`),
      ],
      {
        cwd,
        stdio: "inherit",
      },
    );
    return "pushed";
  } catch (error) {
    execFileSync("git", ["fetch", "--quiet", "--no-tags", remote, branch], {
      cwd,
      stdio: "inherit",
    });
    if (isAncestor({ cwd, ancestor: "FETCH_HEAD", descendant: "HEAD" })) {
      throw error;
    }

    return "superseded";
  }
}

function isAncestor(input: { cwd: string; ancestor: string; descendant: string }): boolean {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", input.ancestor, input.descendant], {
      cwd: input.cwd,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}
