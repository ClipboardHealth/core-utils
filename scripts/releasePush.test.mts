import { strictEqual, throws } from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { pushRelease } from "./releasePush.mts";

// Git hooks (this suite runs in pre-push) export GIT_DIR and friends, which would point every git
// command below, and pushRelease's, at the enclosing repository instead of the temp repositories.
for (const name of Object.keys(process.env)) {
  if (name.startsWith("GIT_")) {
    Reflect.deleteProperty(process.env, name);
  }
}

function git(cwd: string, ...args: string[]): string {
  // Keep the developer's signing config out of these throwaway repositories.
  return execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function commit(cwd: string, message: string): void {
  git(cwd, "commit", "--allow-empty", "--quiet", "--message", message);
}

function remoteRef(remote: string, ref: string): string | undefined {
  const output = git(remote, "for-each-ref", "--format=%(objectname)", ref);
  return output === "" ? undefined : output;
}

void describe("pushRelease", () => {
  let workspace: string;
  let remote: string;
  let releaser: string;
  let merger: string;

  beforeEach(() => {
    workspace = mkdtempSync(path.join(tmpdir(), "release-push-"));
    remote = path.join(workspace, "remote.git");
    releaser = path.join(workspace, "releaser");
    merger = path.join(workspace, "merger");
    execFileSync("git", ["init", "--quiet", "--bare", "--initial-branch=main", remote]);
    for (const clone of [releaser, merger]) {
      execFileSync("git", ["init", "--quiet", "--initial-branch=main", clone]);
      git(clone, "config", "user.name", "Test");
      git(clone, "config", "user.email", "test@example.com");
      git(clone, "remote", "add", "origin", remote);
    }

    commit(merger, "feat: first change");
    git(merger, "push", "--quiet", "origin", "main");
    git(releaser, "fetch", "--quiet", "origin");
    git(releaser, "checkout", "--quiet", "--track", "origin/main", "-B", "main");
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  function prepareRelease(): string {
    commit(releaser, "chore(release): publish [skip actions]");
    git(releaser, "tag", "-a", "pkg-1.1.0", "-m", "pkg-1.1.0");
    return git(releaser, "rev-parse", "HEAD");
  }

  void it("pushes the release commit and its tags when main has not moved", () => {
    const releaseCommit = prepareRelease();

    const actual = pushRelease({
      cwd: releaser,
      remote: "origin",
      branch: "main",
      tags: ["pkg-1.1.0"],
    });

    strictEqual(actual, "pushed");
    strictEqual(remoteRef(remote, "refs/heads/main"), releaseCommit);
    strictEqual(git(remote, "rev-parse", "pkg-1.1.0^{commit}"), releaseCommit);
  });

  void it("reports superseded and pushes nothing when a merge lands during the release", () => {
    prepareRelease();
    commit(merger, "feat: merged during the release");
    git(merger, "push", "--quiet", "origin", "main");
    const mergedCommit = git(merger, "rev-parse", "HEAD");

    const actual = pushRelease({
      cwd: releaser,
      remote: "origin",
      branch: "main",
      tags: ["pkg-1.1.0"],
    });

    strictEqual(actual, "superseded");
    strictEqual(remoteRef(remote, "refs/heads/main"), mergedCommit);
    strictEqual(remoteRef(remote, "refs/tags/pkg-1.1.0"), undefined);
  });

  void it("rethrows a push failure when main has not moved", () => {
    prepareRelease();
    // Pin the hooks directory so a global core.hooksPath can't disable this hook.
    git(remote, "config", "core.hooksPath", path.join(remote, "hooks"));
    const hook = path.join(remote, "hooks", "pre-receive");
    writeFileSync(hook, "#!/bin/sh\necho 'protected branch' >&2\nexit 1\n");
    chmodSync(hook, 0o755);

    throws(
      () => pushRelease({ cwd: releaser, remote: "origin", branch: "main", tags: ["pkg-1.1.0"] }),
      /Command failed: git push/,
    );
    strictEqual(remoteRef(remote, "refs/heads/main"), git(releaser, "rev-parse", "HEAD~1"));
  });

  void it("fails when a release tag already exists on the remote at another object", () => {
    prepareRelease();
    commit(merger, "chore: commit off main");
    git(merger, "tag", "-a", "pkg-1.1.0", "-m", "pkg-1.1.0");
    git(merger, "push", "--quiet", "origin", "refs/tags/pkg-1.1.0");
    const existingTag = git(remote, "rev-parse", "refs/tags/pkg-1.1.0");

    throws(
      () => pushRelease({ cwd: releaser, remote: "origin", branch: "main", tags: ["pkg-1.1.0"] }),
      /Command failed: git push/,
    );
    strictEqual(remoteRef(remote, "refs/heads/main"), git(releaser, "rev-parse", "HEAD~1"));
    strictEqual(git(remote, "rev-parse", "refs/tags/pkg-1.1.0"), existingTag);
  });
});
