import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { runOxlintChanged } from "./runOxlintChanged";

// Wraps spawnSync so tests can stub oxlint failures; other calls run the real oxlint.
vi.mock("node:child_process", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:child_process")>();
  return { ...original, spawnSync: vi.fn(original.spawnSync) };
});

const WORKSPACE_NODE_MODULES = path.resolve(__dirname, "../../../../../node_modules");
// The workspace plugin has no built JavaScript under test, so a fixture stands in for it. The real
// rule has its own tests; these cover diffing, config generation, filtering, and output.
const FIXTURE_PLUGIN = `module.exports = {
  meta: { name: "@clipboard-health" },
  rules: {
    "no-ambiguous-positional-parameters": {
      create(context) {
        return {
          FunctionDeclaration(node) {
            if (node.params.length > 1) {
              context.report({ loc: { start: node.params[0].loc.start, end: node.params.at(-1).loc.end }, message: "ambiguous" });
            }
          },
        };
      },
    },
  },
};
`;
const LEGACY = `export function legacy(first: string, second: string) {
  return first + second;
}
`;

describe("runOxlintChanged", () => {
  let repository: string;
  let pluginPath: string;

  beforeEach(() => {
    repository = mkdtempSync(path.join(tmpdir(), "oxlint-changed-test-"));
    symlinkSync(WORKSPACE_NODE_MODULES, path.join(repository, "node_modules"));
    writeFileSync(
      path.join(repository, ".gitignore"),
      "node_modules\nnode_modules-fixture-plugin.cjs\n",
    );
    writeFileSync(path.join(repository, "package.json"), "{}\n");
    pluginPath = path.join(repository, "node_modules-fixture-plugin.cjs");
    writeFileSync(pluginPath, FIXTURE_PLUGIN);
    mkdirSync(path.join(repository, "src"));
    writeFileSync(path.join(repository, "src/legacy.ts"), LEGACY);
    git({ repository, args: ["init", "--quiet", "--initial-branch=main"] });
    git({ repository, args: ["add", "."] });
    git({ repository, args: ["commit", "--quiet", "--message", "base"] });
  });

  afterEach(() => {
    rmSync(repository, { force: true, recursive: true });
  });

  function stageFile(params: { content: string; filePath: string }): void {
    writeFileSync(path.join(repository, params.filePath), params.content);
    git({ repository, args: ["add", params.filePath] });
  }

  function run(params: { arguments_: readonly string[] }): { exitCode: number; output: string } {
    const output: string[] = [];
    const exitCode = runOxlintChanged({
      arguments_: params.arguments_,
      cwd: repository,
      environment: {},
      pluginPath,
      write: (text) => output.push(text),
    });
    return { exitCode, output: output.join("") };
  }

  it("reports violations on added lines and ignores legacy violations in the same file", () => {
    writeFileSync(
      path.join(repository, "src/legacy.ts"),
      `${LEGACY}\nexport function added(workerId: string, facilityId: string) {\n  return workerId + facilityId;\n}\n`,
    );
    git({ repository, args: ["commit", "--quiet", "--all", "--message", "change"] });
    const output: string[] = [];

    const actual = runOxlintChanged({
      arguments_: ["--base", "HEAD~1"],
      cwd: repository,
      environment: {},
      pluginPath,
      write: (text) => output.push(text),
    });

    expect(actual).toBe(1);
    expect(output.join("")).toContain("src/legacy.ts:5:");
    expect(output.join("")).toContain("no-ambiguous-positional-parameters");
    expect(output.join("")).not.toContain("src/legacy.ts:1:");
  });

  it("checks staged lines", () => {
    writeFileSync(
      path.join(repository, "src/new.ts"),
      "export function render(path: string, isEnabled = true) {\n  return isEnabled ? path : '';\n}\n",
    );
    git({ repository, args: ["add", "src/new.ts"] });
    const output: string[] = [];

    const actual = runOxlintChanged({
      arguments_: ["--staged"],
      cwd: repository,
      environment: { GITHUB_ACTIONS: "true" },
      pluginPath,
      write: (text) => output.push(text),
    });

    expect(actual).toBe(1);
    expect(output.join("")).toContain("::error file=src/new.ts,line=1,");
  });

  it("passes when changed lines are clean", () => {
    writeFileSync(
      path.join(repository, "src/clean.ts"),
      "export function clean(params: { id: string }) {\n  return params.id;\n}\n",
    );
    git({ repository, args: ["add", "src/clean.ts"] });
    const output: string[] = [];

    const actual = runOxlintChanged({
      arguments_: ["--staged"],
      cwd: repository,
      environment: {},
      pluginPath,
      write: (text) => output.push(text),
    });

    expect(actual).toBe(0);
    expect(output.join("")).toContain("changed lines are clean");
  });

  it("skips paths matched by --ignore-pattern", () => {
    mkdirSync(path.join(repository, "src/gen"));
    writeFileSync(
      path.join(repository, "src/gen/client.ts"),
      "export function call(first: string, second: string) {\n  return first + second;\n}\n",
    );
    git({ repository, args: ["add", "src/gen/client.ts"] });
    const output: string[] = [];

    const actual = runOxlintChanged({
      arguments_: ["--staged", "--ignore-pattern", "src/gen/**"],
      cwd: repository,
      environment: {},
      pluginPath,
      write: (text) => output.push(text),
    });

    expect(actual).toBe(0);
    expect(output.join("")).toContain("no changed JavaScript or TypeScript lines");
  });

  it("finds changed files when user config changes diff prefixes", () => {
    git({ repository, args: ["config", "diff.mnemonicPrefix", "true"] });
    writeFileSync(
      path.join(repository, "src/new.ts"),
      "export function assign(workerId: string, workplaceId: string) {\n  return workerId + workplaceId;\n}\n",
    );
    git({ repository, args: ["add", "src/new.ts"] });
    const output: string[] = [];

    const actual = runOxlintChanged({
      arguments_: ["--staged"],
      cwd: repository,
      environment: {},
      pluginPath,
      write: (text) => output.push(text),
    });

    expect(actual).toBe(1);
    expect(output.join("")).toContain("src/new.ts:1:");
  });

  it("refuses to run when a staged file also has unstaged changes", () => {
    writeFileSync(path.join(repository, "src/legacy.ts"), `// staged\n${LEGACY}`);
    git({ repository, args: ["add", "src/legacy.ts"] });
    writeFileSync(path.join(repository, "src/legacy.ts"), `// unstaged\n// staged\n${LEGACY}`);
    const output: string[] = [];

    const actual = runOxlintChanged({
      arguments_: ["--staged"],
      cwd: repository,
      environment: {},
      pluginPath,
      write: (text) => output.push(text),
    });

    expect(actual).toBe(2);
    expect(output.join("")).toContain("unstaged changes");
  });

  it("rejects missing or conflicting diff sources", () => {
    const output: string[] = [];

    const actual = runOxlintChanged({
      arguments_: ["--staged", "--base", "main"],
      cwd: repository,
      environment: {},
      pluginPath,
      write: (text) => output.push(text),
    });

    expect(actual).toBe(2);
    expect(output.join("")).toContain("Usage: oxlint-changed");
  });

  it("prints usage and succeeds with --help", () => {
    const actual = run({ arguments_: ["--help"] });

    expect(actual.exitCode).toBe(0);
    expect(actual.output).toContain("Usage: oxlint-changed");
  });

  it("refuses to run when a file changed since --base has uncommitted changes", () => {
    writeFileSync(path.join(repository, "src/legacy.ts"), `// committed\n${LEGACY}`);
    git({ repository, args: ["commit", "--quiet", "--all", "--message", "change"] });
    writeFileSync(path.join(repository, "src/legacy.ts"), `// uncommitted\n${LEGACY}`);

    const actual = run({ arguments_: ["--base", "HEAD~1"] });

    expect(actual.exitCode).toBe(2);
    expect(actual.output).toContain("uncommitted changes");
  });

  it.each([
    { name: "the default tsconfig", tsconfigArguments: [] },
    { name: "--tsconfig", tsconfigArguments: ["--tsconfig", "tsconfig.json"] },
  ])("adds the type-aware preset with $name", ({ tsconfigArguments }) => {
    stageFile({
      content: '{ "compilerOptions": { "strict": true } }\n',
      filePath: "tsconfig.json",
    });
    stageFile({
      content: "export function label(count: number) {\n  return count ? 'some' : 'none';\n}\n",
      filePath: "src/count.ts",
    });

    const actual = run({ arguments_: ["--staged", "--type-aware", ...tsconfigArguments] });

    expect(actual.exitCode).toBe(1);
    expect(actual.output).toContain("src/count.ts:2:");
    expect(actual.output).toContain("strict-boolean-expressions");
  });

  it("throws when oxlint cannot start", () => {
    stageFile({ content: "export const a = 1;\n", filePath: "src/a.ts" });
    vi.mocked(spawnSync).mockReturnValueOnce({
      error: new Error("spawn failed"),
      output: [],
      pid: 0,
      signal: null,
      status: null,
      stderr: "",
      stdout: "",
    });

    expect(() => run({ arguments_: ["--staged"] })).toThrow("spawn failed");
  });

  it.each([
    { name: "is not JSON", stderr: "config error", stdout: "" },
    { name: "has no diagnostics", stderr: "", stdout: "{}" },
  ])("throws with oxlint's output when it $name", ({ stderr, stdout }) => {
    stageFile({ content: "export const a = 1;\n", filePath: "src/a.ts" });
    vi.mocked(spawnSync).mockReturnValueOnce({
      output: [],
      pid: 0,
      signal: null,
      status: 1,
      stderr,
      stdout,
    });

    expect(() => run({ arguments_: ["--staged"] })).toThrow(
      `oxlint did not return JSON diagnostics:\n${stderr}${stdout}`,
    );
  });
});

function git(params: { args: readonly string[]; repository: string }): void {
  execFileSync(
    "git",
    [
      "-c",
      "user.name=test",
      "-c",
      "user.email=test@example.com",
      "-c",
      "commit.gpgsign=false",
      ...params.args,
    ],
    { cwd: params.repository, stdio: "ignore" },
  );
}
