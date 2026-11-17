import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { formatLintCeilings } from "../lib/internal/lintCeilings/ceilingsFile";
import { runLintCeilings } from "./runLintCeilings";

const WORKSPACE_ROOT = path.resolve(__dirname, "../../../..");

// Complexity default 3; `max-lines` default 12, or 20 for tests; `dist/` ignored.
const OXLINT_CONFIG = {
  categories: { correctness: "off" },
  ignorePatterns: ["dist/"],
  overrides: [{ files: ["**/*.test.ts"], rules: { "max-lines": ["error", { max: 20 }] } }],
  rules: { complexity: ["error", { max: 3 }], "max-lines": ["error", { max: 12 }] },
};

/** A function with complexity `branches + 1`, on `branches + 2` lines. */
function fn(name: string, branches: number): string {
  const body = Array.from(
    { length: branches },
    (_, index) => `  if (a === ${index}) return ${index};\n`,
  );
  return `export function ${name}(a: number): number {\n${body.join("")}  return -1;\n}\n`;
}

function filler(count: number): string {
  return Array.from({ length: count }, (_, index) => `export const v${index} = ${index};\n`).join(
    "",
  );
}

describe("runLintCeilings", () => {
  let repository: string;

  beforeEach(() => {
    repository = mkdtempSync(path.join(tmpdir(), "lint-ceilings-"));
    symlinkSync(path.join(WORKSPACE_ROOT, "node_modules"), path.join(repository, "node_modules"));
    writeFiles({
      ".gitignore": "node_modules\n",
      ".oxlintrc.json": JSON.stringify(OXLINT_CONFIG),
      "package.json": '{ "private": true }\n',
      // Complexity 6 (3 over); 15 lines.
      "src/big.ts": `${fn("big", 5)}${filler(7)}`,
      // 16 lines, within the test default of 20.
      "src/big.test.ts": filler(16),
      "src/small.ts": filler(2),
      "dist/ignored.ts": fn("ignored", 9),
    });
    git("init", "--quiet", "--initial-branch=main");
  });

  afterEach(() => {
    rmSync(repository, { force: true, recursive: true });
  });

  describe("init", () => {
    it("lists every file above its default, honoring overrides and ignorePatterns", () => {
      expect(run("init")).toStrictEqual({
        exitCode: 0,
        output: "cb-lint-ceilings: wrote 2 entries to lint-ceilings.json.\n",
      });
      expect(readCeilings()).toBe(
        '{\n  "version": 1,\n  "rules": {\n    "complexity": {\n      "src/big.ts": 6\n    },\n\n    "max-lines": {\n      "src/big.ts": 15\n    }\n  }\n}\n',
      );
    });

    it("replaces only the requested rules", () => {
      writeCeilings({ complexity: { "src/old.ts": 9 }, "max-lines": { "src/old.ts": 99 } });

      run("init", "--rule", "max-lines");

      expect(JSON.parse(readCeilings())).toStrictEqual({
        rules: { complexity: { "src/old.ts": 9 }, "max-lines": { "src/big.ts": 15 } },
        version: 1,
      });
    });
  });

  describe("check", () => {
    beforeEach(() => {
      run("init");
      commit("base");
    });

    it("passes when listed files are unchanged or shrink", () => {
      expect(run("check", "--base", "main")).toStrictEqual({
        exitCode: 0,
        output: "cb-lint-ceilings: checked 0 changed listed file(s); nothing grew.\n",
      });

      writeFiles({ "src/big.ts": `${fn("big", 5)}${filler(6)}` });

      expect(run("check", "--base", "main")).toStrictEqual({
        exitCode: 0,
        output: "cb-lint-ceilings: checked 1 changed listed file(s); nothing grew.\n",
      });
    });

    it("fails a listed file that grows, even within its ceiling", () => {
      writeCeilings({ complexity: { "src/big.ts": 6 }, "max-lines": { "src/big.ts": 30 } });
      commit("stale-high ceiling");
      writeFiles({ "src/big.ts": `${fn("big", 5)}${filler(8)}` });

      const { exitCode, output } = run("check", "--base", "main");

      expect(exitCode).toBe(1);
      expect(output).toContain(
        "src/big.ts is listed in lint-ceilings.json for max-lines: it may not grow (base: 15; now: 16). Shrink or split it.",
      );
    });

    it.each(["CB_LINT_CEILINGS", "CBH_LINT_CEILINGS"])(
      "measures against the defaults when a configuration that reads %s applies ceilings",
      (name) => {
        // The configuration drops its ceiling only when the CLI asks it to, as createOxlintConfig does.
        rmSync(path.join(repository, ".oxlintrc.json"));
        writeFiles({
          "oxlint.config.ts": `const config = ${JSON.stringify(OXLINT_CONFIG)};
const ceilings = process.env["${name}"] === "ignore"
  ? []
  : [{ files: ["src/big.ts"], rules: { "max-lines": ["error", { max: 30 }] } }];
export default { ...config, overrides: [...config.overrides, ...ceilings] };
`,
          "src/big.ts": `${fn("big", 5)}${filler(8)}`,
        });

        const { exitCode, output } = run("check", "--base", "main");

        expect(exitCode).toBe(1);
        expect(output).toContain("(base: 15; now: 16)");
      },
    );

    it("closes the complexity loophole: a new complex function fails, splitting passes", () => {
      // Adds a function at 4 (1 over) beside the one at 6: the file max holds, the excess grows.
      writeFiles({ "src/big.ts": `${fn("big", 5)}${fn("added", 3)}` });

      const added = run("check", "--base", "main");

      expect(added.exitCode).toBe(1);
      expect(added.output).toContain(
        "it may not grow (base: max 6, 3 over the default in total; now: max 6, 4 over the default in total)",
      );

      // Splits the 6 into a 4 and a 3: max 6 -> 4, excess 3 -> 1.
      writeFiles({ "src/big.ts": `${fn("big", 3)}${fn("rest", 2)}` });

      expect(run("check", "--base", "main").exitCode).toBe(0);
    });

    it("fails a raised or added entry unless increases are allowed", () => {
      writeCeilings({
        complexity: { "src/big.ts": 7 },
        "max-lines": { "src/big.ts": 15, "src/small.ts": 13 },
      });

      const denied = run("check", "--base", "main");
      const allowed = run("check", "--base", "main", "--allow-increases");

      expect(denied.exitCode).toBe(1);
      expect(denied.output).toContain(
        "src/big.ts: complexity ceiling raised from 6 to 7 in lint-ceilings.json.\nsrc/small.ts: new max-lines entry (13) in lint-ceilings.json.\n",
      );
      expect(allowed).toStrictEqual({
        exitCode: 0,
        output:
          "src/big.ts: complexity ceiling raised from 6 to 7 in lint-ceilings.json.\nsrc/small.ts: new max-lines entry (13) in lint-ceilings.json.\n\ncb-lint-ceilings: 2 increase(s) allowed by --allow-increases.\n",
      });
    });

    it("passes removed entries, deleted files, and renames that keep the entry", () => {
      git("mv", "src/big.ts", "src/renamed.ts");
      writeCeilings({ complexity: { "src/renamed.ts": 6 }, "max-lines": { "src/renamed.ts": 15 } });

      expect(run("check", "--base", "main").exitCode).toBe(0);

      git("rm", "--quiet", "--force", "src/renamed.ts");
      writeCeilings({});

      expect(run("check", "--base", "main").exitCode).toBe(0);
    });

    it("fails a file that is not in the canonical layout", () => {
      writeFiles({
        "lint-ceilings.json": '{ "version": 1, "rules": { "max-lines": { "src/big.ts": 14 } } }\n',
      });

      const { exitCode, output } = run("check", "--base", "main");

      expect(exitCode).toBe(1);
      expect(output).toContain("lint-ceilings.json is not in the canonical layout");
    });

    it("compares a GitHub Actions merge commit with its first parent", () => {
      git("switch", "--quiet", "-c", "feature");
      writeFiles({ "src/big.ts": `${fn("big", 5)}${filler(8)}` });
      commit("grow");
      git("switch", "--quiet", "--detach", "main");
      writeFiles({ "src/small.ts": filler(3) });
      commit("main moves on");
      merge("feature");

      const { exitCode, output } = run(
        { GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "pull_request", GITHUB_SHA: rev("HEAD") },
        "check",
      );

      expect(exitCode).toBe(1);
      expect(output).toContain("(base: 15; now: 16)");
    });

    it("uses the pull request base when Actions checked out the head instead", () => {
      // The head merges main back in, so its first parent is the branch's own earlier commit.
      git("switch", "--quiet", "-c", "feature");
      writeFiles({ "src/big.ts": `${fn("big", 5)}${filler(8)}` });
      commit("grow");
      git("switch", "--quiet", "main");
      writeFiles({ "src/small.ts": filler(3) });
      commit("main moves on");
      git("switch", "--quiet", "feature");
      merge("main");

      const { exitCode, output } = run(
        {
          GITHUB_ACTIONS: "true",
          GITHUB_EVENT_NAME: "pull_request",
          GITHUB_EVENT_PATH: writeEvent({ pull_request: { base: { sha: rev("main") } } }),
          GITHUB_SHA: "a-merge-commit-that-was-not-checked-out",
        },
        "check",
      );

      expect(exitCode).toBe(1);
      expect(output).toContain("(base: 15; now: 16)");
    });

    it("compares a merge-queue commit with the queue's base", () => {
      writeFiles({ "src/big.ts": `${fn("big", 5)}${filler(8)}` });
      commit("queued");

      const { exitCode } = run(
        {
          GITHUB_ACTIONS: "true",
          GITHUB_EVENT_NAME: "merge_group",
          GITHUB_EVENT_PATH: writeEvent({ merge_group: { base_sha: rev("HEAD^1") } }),
        },
        "check",
      );

      expect(exitCode).toBe(1);
    });

    it("asks for more history when an Actions checkout lacks the base", () => {
      const shallow = path.join(repository, "shallow");
      writeFiles({ "src/small.ts": filler(3) });
      commit("second");
      git("clone", "--quiet", "--depth=1", `file://${repository}`, shallow);
      const runShallow = (env: Record<string, string>): { exitCode: number } =>
        runLintCeilings({
          args: ["check"],
          cwd: shallow,
          env: { GITHUB_ACTIONS: "true", PATH: process.env["PATH"], ...env },
          write: () => {
            // Throws before writing.
          },
        });

      expect(() =>
        runShallow({ GITHUB_EVENT_NAME: "pull_request", GITHUB_SHA: rev("HEAD") }),
      ).toThrow("check out with `fetch-depth: 2`");
      expect(() =>
        runShallow({
          GITHUB_EVENT_NAME: "merge_group",
          GITHUB_EVENT_PATH: writeEvent({ merge_group: { base_sha: rev("HEAD^1") } }),
        }),
      ).toThrow("is not in this checkout");
    });

    it("refuses to treat an unparsable listed file as within the default", () => {
      writeFiles({ "src/big.ts": "export const = ;\n" });

      expect(() => run("check", "--base", "main")).toThrow("Oxlint could not measure");
    });

    it("passes when there is no lint-ceilings.json", () => {
      rmSync(path.join(repository, "lint-ceilings.json"));

      expect(run("check").output).toBe(
        "cb-lint-ceilings: no lint-ceilings.json; nothing to check.\n",
      );
    });
  });

  describe("tighten", () => {
    it("lowers stale ceilings and drops entries within the default or for missing files", () => {
      writeCeilings({
        complexity: { "src/big.ts": 9, "src/gone.ts": 9 },
        "max-lines": { "src/big.test.ts": 25, "src/big.ts": 15 },
      });

      expect(run("tighten")).toStrictEqual({
        exitCode: 0,
        output:
          "complexity src/big.ts: 9 -> 6.\ncomplexity src/gone.ts: removed (file not found).\nmax-lines src/big.test.ts: removed (within the default).\n\ncb-lint-ceilings: tightened 3 entries.\n",
      });
      expect(JSON.parse(readCeilings())).toStrictEqual({
        rules: { complexity: { "src/big.ts": 6 }, "max-lines": { "src/big.ts": 15 } },
        version: 1,
      });
      expect(run("tighten").output).toBe("cb-lint-ceilings: every ceiling is current.\n");
    });
  });

  it("rejects unknown commands and misplaced options", () => {
    expect(run("format").exitCode).toBe(2);
    expect(run("tighten", "--base", "main").exitCode).toBe(2);
    expect(run("check", "--rule", "complexity").exitCode).toBe(2);
    expect(run("init", "--rule", "no-console").output).toContain('Unsupported rule "no-console"');
    expect(run("--help")).toMatchObject({ exitCode: 0, output: expect.stringContaining("Usage:") });
  });

  function run(...args: Array<string | Record<string, string>>): {
    exitCode: number;
    output: string;
  } {
    const [first] = args;
    const env = typeof first === "object" ? first : {};
    const cliArgs = args.filter((arg): arg is string => typeof arg === "string");
    let output = "";
    const { exitCode } = runLintCeilings({
      args: cliArgs,
      cwd: repository,
      env: { PATH: process.env["PATH"], ...env },
      write: (text) => {
        output += text;
      },
    });
    return { exitCode, output };
  }

  function git(...args: string[]): void {
    execFileSync("git", args, { cwd: repository, stdio: "pipe" });
  }

  function commit(message: string): void {
    git("add", "--all");
    git(
      "-c",
      "user.name=test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "--quiet",
      "-m",
      message,
    );
  }

  function rev(ref: string): string {
    return execFileSync("git", ["rev-parse", ref], { cwd: repository, encoding: "utf8" }).trim();
  }

  function merge(ref: string): void {
    git(
      "-c",
      "user.name=test",
      "-c",
      "user.email=test@example.com",
      "merge",
      "--quiet",
      "--no-ff",
      "--no-edit",
      ref,
    );
  }

  function writeEvent(event: object): string {
    const eventPath = path.join(repository, ".git", "event.json");
    writeFileSync(eventPath, JSON.stringify(event));
    return eventPath;
  }

  function writeFiles(files: Record<string, string>): void {
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(repository, file)), { recursive: true });
      writeFileSync(path.join(repository, file), content);
    }
  }

  function writeCeilings(rules: Record<string, Record<string, number>>): void {
    writeFiles({ "lint-ceilings.json": formatLintCeilings({ ceilings: { rules, version: 1 } }) });
  }

  function readCeilings(): string {
    return readFileSync(path.join(repository, "lint-ceilings.json"), "utf8");
  }
});
