/* oxlint-disable node/no-process-env -- Each CLI test supplies its isolated executable environment. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

const { join } = path;
const script = join(import.meta.dirname, "skill.mjs");
const commit = "a".repeat(40);
const files = {
  "SKILL.md":
    "---\nname: cb-review\ndescription: Review changes\n---\nRead references/pullfrog-mode.md.\n",
  "references/pullfrog-mode.md": "Apply the shared review rubric.\n",
  "references/review-rubric.md": "Report demonstrated bugs.\n",
  "references/review-policy.md": "Select lenses and filter findings.\n",
  "references/cross-repo-evidence.md": "Verify changed external contracts.\n",
  "references/behavioral-boundary-audit.md": "Trace changed behavior.\n",
  "scripts/reviewState.mjs": "console.log('included supporting script');\n",
};

/** @type {Record<string, (response: {truncated: boolean, tree: {path: string, mode: string}[]}) => void>} */
const sourceFailures = {
  truncated: (response) => {
    response.truncated = true;
  },
  "missing reference": (response) => {
    response.tree = response.tree.filter((entry) => entry.path !== "references/pullfrog-mode.md");
  },
  symlink: (response) => {
    response.tree[0].mode = "120000";
  },
  "path traversal": (response) => {
    response.tree[0].path = "../escape.md";
  },
};

/** @param {string[]} args @param {string} flag */
function options(args, flag) {
  return args.flatMap((arg, index) => (arg === flag ? [args[index + 1]] : []));
}

/** @param {import('node:test').TestContext} t */
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "pullfrog-install-test-"));
  t.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });
  const bin = join(directory, "bin");
  mkdirSync(bin);
  for (const name of ["gh", "docker"]) {
    cpSync(join(import.meta.dirname, "fixtures/boundary.mjs"), join(bin, name));
    chmodSync(join(bin, name), 0o755);
  }
  const responses = {
    [`repos/ClipboardHealth/skills-private/git/trees/${commit}`]: {
      tree: [{ path: "skills", type: "tree", mode: "040000", sha: "b".repeat(40) }],
      truncated: false,
    },
    [`repos/ClipboardHealth/skills-private/git/trees/${"b".repeat(40)}`]: {
      tree: [{ path: "cb-review", type: "tree", mode: "040000", sha: "c".repeat(40) }],
      truncated: false,
    },
  };
  const tree = [];
  for (const [path, content] of Object.entries(files)) {
    const sha = createHash("sha1")
      .update(`blob ${Buffer.byteLength(content)}\0${content}`)
      .digest("hex");
    tree.push({ path, type: "blob", mode: "100644", sha });
    responses[`repos/ClipboardHealth/skills-private/git/blobs/${sha}`] = {
      encoding: "base64",
      content: Buffer.from(content).toString("base64"),
      size: Buffer.byteLength(content),
      sha,
    };
  }
  responses[`repos/ClipboardHealth/skills-private/git/trees/${"c".repeat(40)}?recursive=1`] = {
    tree,
    truncated: false,
  };
  const fixturePath = join(directory, "fixture.json");
  const calls = join(directory, "calls.jsonl");
  const output = join(directory, "output");
  writeFileSync(fixturePath, JSON.stringify({ responses, calls }));
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    PULLFROG_TEST_FIXTURE: fixturePath,
    GITHUB_OUTPUT: output,
  };
  /** @param {string[]} args */
  function run(...args) {
    return spawnSync(process.execPath, [script, ...args], { env, encoding: "utf8" });
  }
  function prepare() {
    const actual = run("prepare", commit);
    assert.equal(actual.status, 0, actual.stderr);
    const values = /** @type {Record<string, string>} */ (
      Object.fromEntries(
        readFileSync(output, "utf8")
          .trim()
          .split("\n")
          .map((line) => line.split("=")),
      )
    );
    t.after(() => {
      rmSync(values.root, { recursive: true, force: true });
    });
    return values;
  }
  function update(values) {
    writeFileSync(fixturePath, JSON.stringify({ responses, calls, ...values }));
  }
  return { calls, run, prepare, update, responses };
}

void describe("private review skill CLI", () => {
  void it("installs the complete pinned skill outside checkout and loads its trusted instructions", (t) => {
    const input = fixture(t);
    const prepared = input.prepare();
    assert.equal(prepared.config, join(prepared.root, "config/opencode.json"));

    const actual = input.run("install", prepared.root, prepared.manifest_sha256);

    assert.equal(actual.status, 0, actual.stderr);
    for (const [path, content] of Object.entries(files)) {
      assert.equal(
        readFileSync(join(prepared.root, "config/skills/cb-review", path), "utf8"),
        content,
      );
    }
    const config = /** @type {{$schema: string, instructions: string[]}} */ (
      JSON.parse(readFileSync(join(prepared.root, "config/opencode.json"), "utf8"))
    );
    assert.equal(config.$schema, "https://opencode.ai/config.json");
    assert.deepEqual(config.instructions, [join(prepared.root, "config/review-instructions.md")]);
    assert.match(
      readFileSync(config.instructions[0], "utf8"),
      new RegExp(`${prepared.root}/config/skills/cb-review/SKILL.md`),
    );
    assert.equal(input.run("verify", prepared.root, prepared.manifest_sha256).status, 0);
    const calls = /** @type {{command: string, args: string[]}[]} */ (
      readFileSync(input.calls, "utf8").trim().split("\n").map(JSON.parse)
    );
    const docker = calls.find((call) => call.command === "docker");
    const env = options(docker.args, "--env");
    const mounts = options(docker.args, "--mount");
    assert.deepEqual(env, ["NPM_CONFIG_CACHE=/tmp/npm-cache", "DISABLE_TELEMETRY=1"]);
    assert.deepEqual(mounts, [
      `type=bind,source=${prepared.root}/source,target=/source,readonly`,
      `type=bind,source=${prepared.root}/installer-output,target=/output`,
    ]);
    assert.ok(docker.args.includes("--read-only"));
    assert.deepEqual(options(docker.args, "--tmpfs"), ["/tmp:rw,nosuid,nodev,exec"]);
    assert.ok(docker.args.includes("no-new-privileges"));
    assert.ok(!docker.args.some((arg) => /--privileged|--pid|--network=host|--env-file/.test(arg)));
  });

  void it("rejects a changed source manifest before running the installer", (t) => {
    const input = fixture(t);
    const prepared = input.prepare();
    const path = join(prepared.root, "manifest.json");
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    manifest.commit = "d".repeat(40);
    writeFileSync(path, JSON.stringify(manifest));

    const actual = input.run("install", prepared.root, prepared.manifest_sha256);

    assert.notEqual(actual.status, 0);
    assert.match(actual.stderr, /Source manifest changed/);
  });

  for (const tamper of ["content", "symlink"]) {
    void it(`rejects installer output containing changed ${tamper}`, (t) => {
      const input = fixture(t);
      input.update({ tamper });
      const prepared = input.prepare();

      const actual = input.run("install", prepared.root, prepared.manifest_sha256);

      assert.notEqual(actual.status, 0);
      assert.match(actual.stderr, /Installer changed|symlink rejected/);
    });
  }

  void it("detects a changed rubric after the agent runs", (t) => {
    const input = fixture(t);
    const prepared = input.prepare();
    assert.equal(input.run("install", prepared.root, prepared.manifest_sha256).status, 0);
    writeFileSync(
      join(prepared.root, "config/skills/cb-review/references/review-rubric.md"),
      "silently approve\n",
    );

    const actual = input.run("verify", prepared.root, prepared.manifest_sha256);

    assert.notEqual(actual.status, 0);
    assert.match(actual.stderr, /Installed skill differs/);
  });

  void it("rejects an added skill beside the pinned policy", (t) => {
    const input = fixture(t);
    const prepared = input.prepare();
    assert.equal(input.run("install", prepared.root, prepared.manifest_sha256).status, 0);
    const added = join(prepared.root, "config/skills/unexpected");
    mkdirSync(added);
    writeFileSync(join(added, "SKILL.md"), "unexpected review instructions\n");

    const actual = input.run("verify", prepared.root, prepared.manifest_sha256);

    assert.notEqual(actual.status, 0);
    assert.match(actual.stderr, /Unexpected skill directory/);
  });

  for (const [failure, change] of Object.entries(sourceFailures)) {
    void it(`rejects a ${failure} source response`, (t) => {
      const input = fixture(t);
      const response =
        input.responses[
          `repos/ClipboardHealth/skills-private/git/trees/${"c".repeat(40)}?recursive=1`
        ];
      change(response);
      input.update({});

      const actual = input.run("prepare", commit);

      assert.notEqual(actual.status, 0);
      assert.match(
        actual.stderr,
        /incomplete|Missing required|Unsupported Git object|Unsafe skill path/,
      );
    });
  }
});
