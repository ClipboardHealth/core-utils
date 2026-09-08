/* oxlint-disable node/no-process-env -- The optional probe forwards only its named flag and executable PATH. */
// Run with OpenCode 1.18.5 already installed; no model calls or credentials are needed.
// OPENCODE_DISABLE_PROJECT_CONFIG=true node openCodeConfigProbe.mjs /absolute/path/to/opencode
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "node:test";

const executable = process.argv[2];

/** @param {string} filename @param {string} content */
function write(filename, content) {
  mkdirSync(path.dirname(filename), { recursive: true });
  writeFileSync(filename, content);
}

/** @param {string} marker */
function plugin(marker) {
  return `import { writeFileSync } from "node:fs";
export const Probe = async () => {
  writeFileSync(${JSON.stringify(marker)}, "loaded");
  return {};
};\n`;
}

/** @param {import('node:test').TestContext} t @param {string | undefined} disabled */
function probe(t, disabled) {
  const root = mkdtempSync(path.join(tmpdir(), "pullfrog-opencode-config-"));
  t.after(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const repo = path.join(root, "repo");
  const agentHome = path.join(root, "agent-home");
  const globalConfig = path.join(agentHome, ".config/opencode");
  const trustedConfig = path.join(root, "trusted/opencode.json");
  const trustedInstructions = path.join(root, "trusted/review-instructions.md");
  const trustedSkill = path.join(root, "trusted/skills/cb-review");
  const projectInstructions = [path.join(repo, "ROOT.md"), path.join(repo, "DOT.md")];
  const gateMarker = path.join(root, "gate-loaded");
  const projectMarker = path.join(root, "project-plugin-loaded");
  write(path.join(repo, "AGENTS.md"), "Repository guidance: apply this fixture's conventions.\n");
  write(trustedInstructions, "Trusted review policy fixture.\n");
  write(
    path.join(trustedSkill, "SKILL.md"),
    "---\nname: cb-review\ndescription: Fixture\n---\nReview.\n",
  );
  write(
    trustedConfig,
    JSON.stringify({
      $schema: "https://opencode.ai/config.json",
      instructions: [trustedInstructions],
      skills: { paths: [path.dirname(trustedSkill)] },
    }),
  );
  for (const [index, filename] of ["opencode.json", ".opencode/opencode.json"].entries()) {
    write(projectInstructions[index], `Project config ${index}.\n`);
    write(
      path.join(repo, filename),
      JSON.stringify({ instructions: [projectInstructions[index]] }),
    );
  }
  // Pullfrog's subagent gate lives in the redirected global config plugin directory.
  write(path.join(globalConfig, "plugin/gate.js"), plugin(gateMarker));
  write(path.join(repo, ".opencode/plugin/project.js"), plugin(projectMarker));
  const env = {
    PATH: process.env.PATH,
    HOME: agentHome,
    XDG_CONFIG_HOME: path.dirname(globalConfig),
    XDG_DATA_HOME: path.join(agentHome, ".local/share"),
    XDG_STATE_HOME: path.join(agentHome, ".local/state"),
    XDG_CACHE_HOME: path.join(agentHome, ".cache"),
    PWD: repo,
    OPENCODE_CONFIG: trustedConfig,
    OPENCODE_DISABLE_PROJECT_CONFIG: disabled,
    OPENCODE_DISABLE_AUTOUPDATE: "true",
    OPENCODE_DISABLE_MODELS_FETCH: "true",
    OPENCODE_DISABLE_DEFAULT_PLUGINS: "true",
    // Fixture plugins import only node:fs; unavailable background packages must fail promptly.
    npm_config_offline: "true",
  };
  const initialized = spawnSync("git", ["init", "--quiet", repo], { env, encoding: "utf8" });
  assert.equal(initialized.status, 0, initialized.stderr || String(initialized.error));
  const version = spawnSync(executable, ["--version"], { env, encoding: "utf8", timeout: 30_000 });
  assert.equal(version.status, 0, version.stderr || String(version.error));
  assert.equal(
    version.stdout.trim(),
    "1.18.5",
    "Probe must use Pullfrog's pinned OpenCode version",
  );

  const actual = spawnSync(executable, ["debug", "config"], {
    cwd: repo,
    env,
    encoding: "utf8",
    timeout: 120_000,
    killSignal: "SIGKILL",
    maxBuffer: 4 * 1024 * 1024,
  });

  assert.equal(
    actual.status,
    0,
    actual.stderr || String(actual.error ?? `OpenCode exited via ${actual.signal}`),
  );
  const config = /** @type {{instructions: string[], skills: {paths: string[]}}} */ (
    JSON.parse(actual.stdout)
  );
  assert.ok(
    config.instructions.includes(trustedInstructions),
    "Trusted activation must remain configured",
  );
  assert.deepEqual(config.skills.paths, [path.dirname(trustedSkill)]);
  assert.equal(readFileSync(gateMarker, "utf8"), "loaded", "Global gate plugin must still execute");
  return { config, projectInstructions, projectPluginLoaded: existsSync(projectMarker) };
}

void it("excludes project OpenCode config and plugins while preserving trusted config and global plugins", (t) => {
  assert.equal(typeof executable, "string", "Pass the OpenCode 1.18.5 executable path");
  assert.ok(path.isAbsolute(executable), "Pass an absolute executable path");
  const control = probe(t, "false");
  for (const instruction of control.projectInstructions) {
    assert.ok(
      control.config.instructions.includes(instruction),
      "Unprotected control must load project config",
    );
  }
  assert.equal(
    control.projectPluginLoaded,
    true,
    "Unprotected control must execute the project plugin",
  );

  const actual = probe(t, process.env.OPENCODE_DISABLE_PROJECT_CONFIG);

  for (const instruction of actual.projectInstructions) {
    assert.ok(
      !actual.config.instructions.includes(instruction),
      "Project instructions must be excluded",
    );
  }
  assert.equal(actual.projectPluginLoaded, false, "Project plugin code must not execute");
});
