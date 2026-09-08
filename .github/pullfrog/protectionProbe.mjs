import assert from "node:assert/strict";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  rmdirSync,
  truncateSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const { join } = path;

/** @param {string} directory */
function checkOwnership(directory) {
  const stat = lstatSync(directory);
  assert.equal(stat.uid, 0, "Review policy must be root-owned.");
  // oxlint-disable-next-line no-bitwise -- POSIX write permissions are a bitmask.
  assert.equal(stat.mode & 0o222, 0, "Review policy must not be writable.");
  assert.ok(!stat.isSymbolicLink(), "Review policy must not contain symlinks.");
  if (stat.isDirectory()) {
    for (const name of readdirSync(directory)) {
      checkOwnership(join(directory, name));
    }
  } else {
    assert.ok(stat.isFile(), "Review policy must contain only files and directories.");
  }
}

/** @param {string} name @param {() => void} operation */
function denied(name, operation) {
  try {
    operation();
  } catch (error) {
    const { code } = /** @type {NodeJS.ErrnoException} */ (error);
    assert.ok(code === "EACCES" || code === "EPERM", `${name}: unexpected filesystem error.`);
    return;
  }
  throw new Error(`${name}: unprivileged mutation was allowed.`);
}

/** @param {string} root */
function probe(root) {
  assert.match(root, /^\/tmp\/pullfrog-review-[A-Za-z0-9]{6}$/);
  assert.ok(process.getuid && process.getuid() !== 0, "Run the probe without root privileges.");
  checkOwnership(root);
  for (const file of [
    "skill.mjs",
    "manifest.json",
    "config/opencode.json",
    "config/review-instructions.md",
    "config/skills/cb-review/SKILL.md",
    "config/skills/cb-review/references/pullfrog-mode.md",
    "config/skills/cb-review/references/review-policy.md",
    "config/skills/cb-review/references/review-rubric.md",
  ]) {
    readFileSync(join(root, file));
  }
  const directory = join(root, "protection-probe");
  const file = join(directory, "file");
  const scratch = mkdtempSync("/tmp/pullfrog-protection-probe-");
  const replacement = join(scratch, "replacement");
  writeFileSync(replacement, "probe\n");
  try {
    denied("write", () => {
      writeFileSync(file, "changed\n");
    });
    denied("truncate", () => {
      truncateSync(file, 0);
    });
    denied("chmod", () => {
      chmodSync(file, 0o644);
    });
    denied("unlink", () => {
      unlinkSync(file);
    });
    denied("atomic replace", () => {
      renameSync(replacement, file);
    });
    denied("file rename", () => {
      renameSync(file, join(directory, "moved"));
    });
    denied("directory rename", () => {
      renameSync(directory, join(root, "probe-moved"));
    });
    denied("new skill", () => {
      mkdirSync(join(root, "config/skills/probe"));
    });
    denied("root rename", () => {
      renameSync(root, join(scratch, "moved"));
    });
  } finally {
    rmSync(replacement, { force: true });
    // Do not recursively remove anything if an unexpected rename succeeded.
    rmdirSync(scratch);
  }
  process.stdout.write("Verified unprivileged policy reads and denied all native mutations.\n");
}

try {
  assert.equal(process.argv.length, 3, "Usage: protectionProbe.mjs ROOT");
  probe(process.argv[2]);
} catch (error) {
  process.stderr.write(
    `Policy protection failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
  );
  process.exitCode = 1;
}
