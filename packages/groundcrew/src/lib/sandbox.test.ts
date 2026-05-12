import { sep } from "node:path";

import { sandboxWorktreeDirFor } from "./sandbox.js";

describe(sandboxWorktreeDirFor, () => {
  it("returns the worktree dir under the sandbox's worktrees root", () => {
    const actual = sandboxWorktreeDirFor({
      repoDir: "/work/repo-a",
      sandboxName: "groundcrew-repo-a-claude",
      branchName: "alice-team-123",
    });

    expect(actual).toBe("/work/repo-a/.sbx/groundcrew-repo-a-claude-worktrees/alice-team-123");
  });

  it("throws when branchName resolves outside the worktrees root", () => {
    expect(() =>
      sandboxWorktreeDirFor({
        repoDir: "/work/repo-a",
        sandboxName: "groundcrew-repo-a-claude",
        branchName: `..${sep}evil`,
      }),
    ).toThrow(/Invalid branchName/);
  });

  it("throws when branchName is an absolute path", () => {
    expect(() =>
      sandboxWorktreeDirFor({
        repoDir: "/work/repo-a",
        sandboxName: "groundcrew-repo-a-claude",
        branchName: "/etc/passwd",
      }),
    ).toThrow(/Invalid branchName/);
  });
});
