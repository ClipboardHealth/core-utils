/* oxlint-disable node/no-process-env -- This standalone Actions CLI reads GITHUB_OUTPUT. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const { join, posix, resolve } = path;
/** @typedef {{path: string, type: string, mode: string, sha: string}} GitEntry */
/** @typedef {{commit: string, files: Record<string, string>, activation: string}} Manifest */

const repository = "ClipboardHealth/skills-private";
const image =
  "public.ecr.aws/docker/library/node@sha256:da81deb96d49fc84c9813bc4f16dfdb1d4d7e3671b74cd54fd944428f1444afe";
const required = [
  "SKILL.md",
  "references/pullfrog-mode.md",
  "references/review-policy.md",
  "references/review-rubric.md",
  "references/cross-repo-evidence.md",
  "references/behavioral-boundary-audit.md",
];

/** @param {import('node:crypto').BinaryLike} content */
function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

/** @param {string} command @param {string[]} args */
function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    // Avoid echoing GitHub response bodies or container output: skills are private.
    throw new Error(`${command} failed (${result.error?.code ?? result.status}).`);
  }
  return result.stdout;
}

/** @param {string} path @returns {unknown} */
function api(path) {
  return JSON.parse(
    run("gh", [
      "api",
      "--header",
      "X-GitHub-Api-Version: 2022-11-28",
      `repos/${repository}/git/${path}`,
    ]),
  );
}

/** @param {string} sha @returns {GitEntry[]} */
function readTree(sha, recursive = false) {
  assert.match(sha, /^[a-f0-9]{40}$/, "Expected an immutable Git object SHA.");
  const response = /** @type {{tree: GitEntry[], truncated: boolean}} */ (
    api(`trees/${sha}${recursive ? "?recursive=1" : ""}`)
  );
  assert.equal(response.truncated, false, "GitHub tree response is incomplete.");
  assert.ok(Array.isArray(response.tree), "GitHub tree response is missing its entries.");
  return response.tree;
}

/** @param {string} sha @param {string} name */
function subtree(sha, name) {
  const entry = readTree(sha).find((item) => item.path === name);
  assert.equal(entry?.type, "tree", `Missing directory: ${name}`);
  return entry.sha;
}

/** @param {string} path */
function safePath(path) {
  assert.equal(typeof path, "string");
  assert.ok(path.length > 0 && !path.includes("\\") && !path.includes("\0"), "Unsafe skill path.");
  assert.ok(
    !posix.isAbsolute(path) && posix.normalize(path) === path && !path.split("/").includes(".."),
    "Unsafe skill path.",
  );
  return path;
}

/** @param {string} directory @returns {Record<string, string>} */
function fileManifest(directory, prefix = "") {
  assert.ok(
    lstatSync(directory).isDirectory() && !lstatSync(directory).isSymbolicLink(),
    "Expected a real directory.",
  );
  return Object.fromEntries(
    readdirSync(directory)
      .toSorted()
      .flatMap((name) => {
        const relative = prefix ? `${prefix}/${name}` : name;
        const path = join(directory, name);
        const stat = lstatSync(path);
        assert.ok(!stat.isSymbolicLink(), `Skill symlink rejected: ${relative}`);
        if (stat.isDirectory()) {
          return Object.entries(fileManifest(path, relative));
        }
        assert.ok(stat.isFile(), `Unsupported skill file: ${relative}`);
        return [[relative, sha256(readFileSync(path))]];
      }),
  );
}

/** @param {string} name @param {string} value */
function emit(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
}

/** @param {string} commit */
function prepare(commit) {
  assert.match(commit, /^[a-f0-9]{40}$/, "Pin the private skill to a complete commit SHA.");
  const tree = readTree(subtree(subtree(commit, "skills"), "cb-review"), true);
  const root = mkdtempSync("/tmp/pullfrog-review-");
  const source = join(root, "source/cb-review");
  mkdirSync(source, { recursive: true });
  const seen = new Set();
  for (const entry of tree) {
    const path = safePath(entry.path);
    assert.ok(!seen.has(path), `Duplicate GitHub tree entry: ${path}`);
    seen.add(path);
    if (entry.type === "tree" && entry.mode === "040000") {
      continue;
    }
    assert.ok(
      entry.type === "blob" && ["100644", "100755"].includes(entry.mode),
      `Unsupported Git object: ${path}`,
    );
    assert.match(entry.sha, /^[a-f0-9]{40}$/, "Expected an immutable Git blob SHA.");
    const blob = /** @type {{encoding: string, content: string, size: number}} */ (
      api(`blobs/${entry.sha}`)
    );
    assert.equal(blob.encoding, "base64", `Unsupported blob encoding: ${path}`);
    const content = Buffer.from(blob.content, "base64");
    assert.equal(content.length, blob.size, `Incomplete GitHub blob: ${path}`);
    const actual = createHash("sha1")
      .update(`blob ${content.length}\0`)
      .update(content)
      .digest("hex");
    assert.equal(actual, entry.sha, `GitHub blob hash mismatch: ${path}`);
    mkdirSync(join(source, posix.dirname(path)), { recursive: true });
    writeFileSync(join(source, path), content, { mode: entry.mode === "100755" ? 0o755 : 0o644 });
  }
  const files = fileManifest(source);
  for (const path of required) {
    assert.ok(files[path], `Missing required skill file: ${path}`);
  }
  const activation = readFileSync(
    join(import.meta.dirname, "review-instructions.md"),
    "utf8",
  ).replaceAll("{{SKILL_PATH}}", join(root, "config/skills/cb-review/SKILL.md"));
  writeFileSync(join(root, "review-instructions.md"), activation);
  const manifest = JSON.stringify({ commit, files, activation: sha256(activation) });
  writeFileSync(join(root, "manifest.json"), manifest);
  cpSync(import.meta.filename, join(root, "skill.mjs"));
  emit("root", root);
  emit("config", join(root, "config"));
  emit("script_sha256", sha256(readFileSync(join(root, "skill.mjs"))));
  emit("manifest_sha256", sha256(manifest));
  process.stdout.write(`Prepared cb-review at ${commit} (${Object.keys(files).length} files).\n`);
}

/** @param {string} root @param {string} expectedHash @returns {Manifest} */
function readManifest(root, expectedHash) {
  const bytes = readFileSync(join(root, "manifest.json"));
  if (expectedHash) {
    assert.equal(sha256(bytes), expectedHash, "Source manifest changed.");
  }
  return /** @type {Manifest} */ (JSON.parse(bytes));
}

/** @param {string} root @param {string} expectedHash */
function verify(root, expectedHash) {
  assert.match(expectedHash, /^[a-f0-9]{64}$/, "Expected the pre-install manifest hash.");
  const expected = readManifest(root, expectedHash);
  assert.deepEqual(
    fileManifest(join(root, "config/skills/cb-review")),
    expected.files,
    "Installed skill differs from the pinned source.",
  );
  assert.equal(
    sha256(readFileSync(join(root, "config/review-instructions.md"))),
    expected.activation,
    "Review activation changed.",
  );
  const config = JSON.parse(readFileSync(join(root, "config/opencode.json"), "utf8"));
  assert.deepEqual(
    config,
    {
      $schema: "https://opencode.ai/config.json",
      instructions: [join(root, "config/review-instructions.md")],
      skills: { paths: [join(root, "config/skills")] },
    },
    "Trusted OpenCode configuration changed.",
  );
  process.stdout.write(`Verified cb-review at ${expected.commit}.\n`);
}

/** @param {string} root @param {string} expectedHash */
function install(root, expectedHash) {
  assert.match(expectedHash, /^[a-f0-9]{64}$/, "Expected the pre-install manifest hash.");
  const expected = readManifest(root, expectedHash);
  const source = join(root, "source");
  const output = join(root, "installer-output");
  mkdirSync(output);
  run("docker", [
    "run",
    "--rm",
    "--user",
    `${process.getuid()}:${process.getgid()}`,
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--read-only",
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,exec",
    "--workdir",
    "/output",
    "--env",
    "NPM_CONFIG_CACHE=/tmp/npm-cache",
    "--env",
    "DISABLE_TELEMETRY=1",
    "--mount",
    `type=bind,source=${source},target=/source,readonly`,
    "--mount",
    `type=bind,source=${output},target=/output`,
    image,
    "npx",
    "--yes",
    "skills@1.5.23",
    "add",
    "/source",
    "--skill",
    "cb-review",
    "--agent",
    "opencode",
    "--copy",
    "--yes",
  ]);
  const installed = join(output, ".agents/skills/cb-review");
  assert.deepEqual(fileManifest(installed), expected.files, "Installer changed the pinned skill.");
  mkdirSync(join(root, "config/skills"), { recursive: true });
  cpSync(installed, join(root, "config/skills/cb-review"), { recursive: true });
  cpSync(join(root, "review-instructions.md"), join(root, "config/review-instructions.md"));
  writeFileSync(
    join(root, "config/opencode.json"),
    JSON.stringify({
      $schema: "https://opencode.ai/config.json",
      instructions: [join(root, "config/review-instructions.md")],
      skills: { paths: [join(root, "config/skills")] },
    }),
  );
  verify(root, expectedHash);
  process.stdout.write(`Review policy: ${root}/config/review-instructions.md\n`);
}

try {
  const [command, argument, expectedHash] = process.argv.slice(2);
  if (command === "prepare") {
    prepare(argument);
  } else {
    assert.match(
      argument,
      /^\/tmp\/pullfrog-review-[\w-]+$/,
      "Expected a prepared /tmp skill directory.",
    );
    assert.equal(resolve(argument), argument);
    if (command === "install") {
      install(argument, expectedHash);
    } else if (command === "verify") {
      verify(argument, expectedHash);
    } else {
      throw new Error(
        "Usage: skill.mjs prepare <commit> | install|verify <root> <manifest-sha256>",
      );
    }
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
