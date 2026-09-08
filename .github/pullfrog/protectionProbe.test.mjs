import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { it } from "node:test";

const { join } = path;
const hasLinuxRoot = process.platform === "linux" && process.getuid?.() === 0;

void it(
  "rejects an unreadable reference under the unprivileged review identity",
  { skip: !hasLinuxRoot },
  (t) => {
    const root = mkdtempSync("/tmp/pullfrog-review-");
    t.after(() => {
      rmSync(root, { recursive: true, force: true });
    });
    for (const file of [
      "skill.mjs",
      "manifest.json",
      "config/opencode.json",
      "config/review-instructions.md",
      "config/skills/cb-review/SKILL.md",
      "config/skills/cb-review/references/pullfrog-mode.md",
      "config/skills/cb-review/references/review-policy.md",
      "config/skills/cb-review/references/review-rubric.md",
      "config/skills/cb-review/references/cross-repo-evidence.md",
    ]) {
      const location = join(root, file);
      mkdirSync(path.dirname(location), { recursive: true });
      writeFileSync(location, "Public policy fixture.\n");
    }
    const protect = spawnSync("bash", [join(import.meta.dirname, "protect.sh"), root], {
      encoding: "utf8",
    });
    assert.equal(protect.status, 0, protect.stderr);
    const runProbe = () =>
      spawnSync(process.execPath, [join(import.meta.dirname, "protectionProbe.mjs"), root], {
        encoding: "utf8",
        uid: 1000,
        gid: 1000,
      });
    const readable = runProbe();
    assert.equal(readable.status, 0, readable.stderr);
    chmodSync(join(root, "config/skills/cb-review/references/cross-repo-evidence.md"), 0o000);

    const actual = runProbe();

    assert.notEqual(actual.status, 0);
    assert.match(actual.stderr, /EACCES.*cross-repo-evidence\.md/);
  },
);
