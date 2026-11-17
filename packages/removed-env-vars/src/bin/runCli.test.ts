import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { runCli } from "./runCli";

const TODAY = "2026-11-17";
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("runCli", () => {
  it("fails when a renamed secret is still read by an installed internal package", () => {
    const cwd = createRepository({
      "terraform/templates/base.json": template({ secrets: ["API_URL", "OTHER_URL"] }),
      "src/main.ts": "export const port = 3000;\n",
    });
    writeFiles(cwd, {
      "node_modules/@clipboard-health/example-client/src/client.js":
        'const url = process.env["API_URL"] ?? process.env["DEFAULT_URL"];\n',
    });
    commitFiles(cwd, {
      "terraform/templates/base.json": template({ secrets: ["API_ENDPOINT", "OTHER_URL"] }),
    });

    const actual = run(cwd);

    expect(actual.exitCode).toBe(1);
    expect(actual.output).toContain(
      "API_URL is no longer set by terraform/templates/base.json, but code still reads it:",
    );
    expect(actual.output).toContain(
      'node_modules/@clipboard-health/example-client/src/client.js:1  const url = process.env["API_URL"]',
    );
  });

  it("passes once the readers move to the new name in the same change", () => {
    const cwd = createRepository({
      "terraform/templates/base.json": template({ secrets: ["API_URL"] }),
      "src/client.ts": "export const url = process.env.API_URL;\n",
    });
    commitFiles(cwd, {
      "terraform/templates/base.json": template({ secrets: ["API_ENDPOINT"] }),
      "src/client.ts": "export const url = process.env.API_ENDPOINT;\n",
    });

    const actual = run(cwd);

    expect(actual).toEqual({
      exitCode: 0,
      output: "Removed API_URL (was in terraform/templates/base.json): no readers found.\n",
    });
  });

  it("passes when no template variable is removed", () => {
    const cwd = createRepository({
      "terraform/templates/base.json": template({ environment: ["NODE_ENV"] }),
      "src/main.ts": "export const environment = process.env.NODE_ENV;\n",
    });
    commitFiles(cwd, {
      "terraform/templates/base.json": template({ environment: ["NODE_ENV", "NEW_FLAG"] }),
    });

    expect(run(cwd)).toEqual({ exitCode: 0, output: "" });
  });

  it("passes when a variable moves between templates", () => {
    const cwd = createRepository({
      "terraform/templates/base.json": template({ environment: ["NODE_ENV"] }),
      "terraform/templates/web.json": template({ secrets: ["API_KEY"] }),
      "src/main.ts": "export const key = process.env.API_KEY;\n",
    });
    commitFiles(cwd, {
      "terraform/templates/base.json": template({
        environment: ["NODE_ENV"],
        secrets: ["API_KEY"],
      }),
      "terraform/templates/web.json": template({}),
    });

    expect(run(cwd)).toEqual({ exitCode: 0, output: "" });
  });

  it.each([
    ["dot access", "const value = process.env.API_KEY;"],
    ["optional access", "const value = process.env?.API_KEY;"],
    ["bracket access", "const value = process.env['API_KEY'];"],
    ["destructuring", "const { PORT, API_KEY } = process.env;"],
    ["a string literal", 'const value = getRequiredEnvironmentVariable("API_KEY");'],
    ["a schema key", "const schema = z.object({ API_KEY: z.string() });"],
    ["a class property", "class Environment { API_KEY!: string; }"],
    ["code after a block comment", "/*#__PURE__*/ connect(process.env.API_KEY);"],
  ])("fails on %s in repository code", (_label, source) => {
    const cwd = createRepository({
      "terraform/templates/base.json": template({ secrets: ["API_KEY"] }),
      "src/client.ts": `${source}\n`,
    });
    commitFiles(cwd, { "terraform/templates/base.json": template({}) });

    const actual = run(cwd);

    expect(actual.exitCode).toBe(1);
    expect(actual.output).toContain(`src/client.ts:1  ${source}`);
  });

  it("fails on destructuring wrapped across lines", () => {
    const cwd = createRepository({
      "terraform/templates/base.json": template({ secrets: ["API_KEY"] }),
      "src/client.ts": "const {\n  PORT,\n  API_KEY,\n} = process.env;\n",
    });
    commitFiles(cwd, { "terraform/templates/base.json": template({}) });

    const actual = run(cwd);

    expect(actual.exitCode).toBe(1);
    expect(actual.output).toContain("src/client.ts:3  API_KEY,");
  });

  it("ignores a local variable that shares the name", () => {
    const cwd = createRepository({
      "terraform/templates/base.json": template({ environment: ["PORT"] }),
      "src/main.ts": "const PORT = 3000;\nexport { PORT as port };\n",
    });
    commitFiles(cwd, { "terraform/templates/base.json": template({}) });

    expect(run(cwd).exitCode).toBe(0);
  });

  it("ignores names that only share a prefix", () => {
    const cwd = createRepository({
      "terraform/templates/base.json": template({ secrets: ["API_KEY"] }),
      "src/client.ts": 'const value = process.env.API_KEY_V2 ?? process.env["API_KEY_OLD"];\n',
    });
    commitFiles(cwd, { "terraform/templates/base.json": template({}) });

    expect(run(cwd).exitCode).toBe(0);
  });

  it("fails when an @clipboard-health/config value derives the removed name", () => {
    const cwd = createRepository({
      "terraform/templates/base.json": template({ secrets: ["BACKEND_SERVICE_BASE_URL"] }),
      "src/config.ts": [
        "export const config = createConfig({",
        "  config: {",
        "    backendService: {",
        "      baseURL: {",
        '        defaultValue: "http://localhost",',
        '        description: "Backend base URL",',
        "      },",
        "    },",
        "  },",
        "});",
        "",
      ].join("\n"),
    });
    commitFiles(cwd, { "terraform/templates/base.json": template({}) });

    const actual = run(cwd);

    expect(actual.exitCode).toBe(1);
    expect(actual.output).toContain(
      "src/config.ts:4  config.backendService.baseURL (read from BACKEND_SERVICE_BASE_URL by @clipboard-health/config)",
    );
  });

  it("ignores development-only packages, test files and comments", () => {
    const cwd = createRepository({
      "terraform/templates/base.json": template({ secrets: ["API_KEY"] }),
      "package-lock.json": JSON.stringify({
        packages: {
          "node_modules/@clipboard-health/testing": { dev: true },
          "node_modules/@clipboard-health/runtime": {},
        },
      }),
      "src/client.spec.ts": "process.env.API_KEY = 'test';\n",
      "src/client.ts": "// Reads process.env.API_KEY when set.\n",
    });
    writeFiles(cwd, {
      "node_modules/@clipboard-health/testing/index.js": "const key = process.env.API_KEY;\n",
      "node_modules/@clipboard-health/runtime/index.js": " * Uses `process.env.API_KEY`.\n",
    });
    commitFiles(cwd, { "terraform/templates/base.json": template({}) });

    expect(run(cwd)).toEqual({
      exitCode: 0,
      output: "Removed API_KEY (was in terraform/templates/base.json): no readers found.\n",
    });
  });

  it("matches the full @clipboard-health/config path below config", () => {
    const cwd = createRepository({
      "terraform/templates/base.json": template({ environment: ["PORT"] }),
      "src/config.ts": [
        "export const config = createConfig({",
        "  config: {",
        '    server: { port: { defaultValue: 3000, description: "Server port" } },',
        "  },",
        "});",
        "",
      ].join("\n"),
    });
    commitFiles(cwd, { "terraform/templates/base.json": template({}) });

    expect(run(cwd).exitCode).toBe(0);
  });

  it("searches nested packages only in the configured scopes", () => {
    const cwd = createRepository({
      "terraform/templates/base.json": template({ environment: ["API_KEY", "LOG_LEVEL"] }),
    });
    writeFiles(cwd, {
      "node_modules/@clipboard-health/client/node_modules/vendor/index.js":
        "const level = process.env.LOG_LEVEL;\n",
      "node_modules/@clipboard-health/client/node_modules/@clipboard-health/auth/index.js":
        "const key = process.env.API_KEY;\n",
    });
    commitFiles(cwd, { "terraform/templates/base.json": template({}) });

    const actual = run(cwd);

    expect(actual.exitCode).toBe(1);
    expect(actual.output).toContain(
      "node_modules/@clipboard-health/client/node_modules/@clipboard-health/auth/index.js:1",
    );
    expect(actual.output).toContain(
      "Removed LOG_LEVEL (was in terraform/templates/base.json): no readers found.",
    );
  });

  it("compares with the merge base, ignoring variables the base branch added later", () => {
    const cwd = createRepository({
      "terraform/templates/base.json": template({}),
      "src/client.ts": "const value = process.env.API_KEY;\n",
    });
    git(cwd, ["checkout", "--quiet", "-b", "feature"]);
    commitFiles(cwd, { "README.md": "Feature\n" });
    git(cwd, ["checkout", "--quiet", "main"]);
    commitFiles(cwd, { "terraform/templates/base.json": template({ secrets: ["API_KEY"] }) });
    git(cwd, ["checkout", "--quiet", "feature"]);

    expect(runWith({ arguments_: ["--base", "main"], cwd })).toEqual({ exitCode: 0, output: "" });
  });

  it("passes with an unexpired exception and reports it", () => {
    const cwd = createRepository({
      "terraform/templates/base.json": template({ secrets: ["API_KEY"] }),
      "src/client.ts": "const value = process.env.API_KEY ?? 'unused';\n",
    });
    commitFiles(cwd, {
      "terraform/templates/base.json": template({}),
      ".github/removed-env-vars-exceptions.json": exceptions([
        { name: "API_KEY", reason: "Fallback is safe", ticket: "ABC-1", expiresOn: TODAY },
      ]),
    });

    expect(run(cwd)).toEqual({
      exitCode: 0,
      output:
        "Removed API_KEY (was in terraform/templates/base.json): still read; exception ABC-1 until 2026-11-17: Fallback is safe\n",
    });
  });

  it("fails with an expired exception", () => {
    const cwd = createRepository({
      "terraform/templates/base.json": template({ secrets: ["API_KEY"] }),
      "src/client.ts": "const value = process.env.API_KEY;\n",
    });
    commitFiles(cwd, {
      "terraform/templates/base.json": template({}),
      ".github/removed-env-vars-exceptions.json": exceptions([
        { name: "API_KEY", reason: "Fallback is safe", ticket: "ABC-1", expiresOn: "2026-11-16" },
      ]),
    });

    const actual = run(cwd);

    expect(actual.exitCode).toBe(1);
    expect(actual.output).toContain("the exception for API_KEY expired on 2026-11-16");
  });

  it("fails on an exception without a reason, ticket or valid expiry", () => {
    const cwd = createRepository({ "terraform/templates/base.json": template({}) });
    commitFiles(cwd, {
      ".github/removed-env-vars-exceptions.json": exceptions([
        { name: "API_KEY", reason: " ", ticket: "ABC-1", expiresOn: "2026-11-17" },
        { name: "API_KEY", reason: "Safe", ticket: "ABC-1", expiresOn: "2026-02-30" },
      ]),
    });

    const actual = run(cwd);

    expect(actual.exitCode).toBe(1);
    expect(actual.output).toContain(
      ".github/removed-env-vars-exceptions.json[0]: missing or empty reason",
    );
    expect(actual.output).toContain(
      ".github/removed-env-vars-exceptions.json[1]: expiresOn must be a YYYY-MM-DD date",
    );
  });

  it("warns about an exception that matches no removed variable", () => {
    const cwd = createRepository({ "terraform/templates/base.json": template({}) });
    commitFiles(cwd, {
      ".github/removed-env-vars-exceptions.json": exceptions([
        { name: "OLD_KEY", reason: "Safe", ticket: "ABC-1", expiresOn: "2027-01-01" },
      ]),
    });

    expect(run(cwd)).toEqual({
      exitCode: 0,
      output:
        "Warning: the exception for OLD_KEY in .github/removed-env-vars-exceptions.json matches no removed variable; delete it.\n",
    });
  });

  it("fails on a template that isn't JSON", () => {
    const cwd = createRepository({ "terraform/templates/base.json": template({}) });
    commitFiles(cwd, { "terraform/templates/base.json": "{" });

    const actual = run(cwd);

    expect(actual.exitCode).toBe(1);
    expect(actual.output).toContain("terraform/templates/base.json: can't parse template");
  });

  it("writes GitHub annotations in GitHub Actions", () => {
    const cwd = createRepository({
      "terraform/templates/base.json": template({ secrets: ["API_KEY"] }),
      "src/client.ts": "const value = process.env.API_KEY;\n",
    });
    commitFiles(cwd, { "terraform/templates/base.json": template({}) });

    const actual = run(cwd, { isGitHubActions: true });

    expect(actual.output).toContain(
      "::error file=terraform/templates/base.json::API_KEY is no longer set by terraform/templates/base.json, but code still reads it:%0A  src/client.ts:1",
    );
  });

  it("reads custom template directories", () => {
    const cwd = createRepository({
      "deploy/service.json": template({ secrets: ["API_KEY"] }),
      "src/client.ts": "const value = process.env.API_KEY;\n",
    });
    commitFiles(cwd, { "deploy/service.json": template({}) });

    expect(run(cwd, { extraArguments: ["--templates", "deploy"] }).exitCode).toBe(1);
  });

  it("returns a usage error without a base revision", () => {
    const actual = runWith({ arguments_: [], cwd: os.tmpdir() });

    expect(actual.exitCode).toBe(2);
    expect(actual.output).toContain("Usage: removed-env-vars --base <git-revision>");
  });

  it("throws when the base revision isn't available", () => {
    const cwd = createRepository({ "terraform/templates/base.json": template({}) });

    expect(() => runWith({ arguments_: ["--base", "missing-ref"], cwd })).toThrow(
      "Can't find the merge base of missing-ref and HEAD. Fetch the base revision and enough history before running the check.",
    );
  });
});

function template(params: { environment?: string[]; secrets?: string[] }): string {
  const { environment = [], secrets = [] } = params;
  return `${JSON.stringify(
    {
      environment: environment.map((name) => ({ name, value: "value" })),
      secrets: secrets.map((name) => ({
        name,
        valueFrom: `arn:aws:ssm:us-east-1:123456789012:parameter/${name}`,
      })),
    },
    undefined,
    2,
  )}\n`;
}

function exceptions(entries: readonly Record<string, string>[]): string {
  return `${JSON.stringify(entries, undefined, 2)}\n`;
}

function run(
  cwd: string,
  options: { extraArguments?: string[]; isGitHubActions?: boolean } = {},
): { exitCode: number; output: string } {
  return runWith({
    arguments_: ["--base", "base", ...(options.extraArguments ?? [])],
    cwd,
    isGitHubActions: options.isGitHubActions,
  });
}

function runWith(params: {
  arguments_: string[];
  cwd: string;
  isGitHubActions?: boolean | undefined;
}): { exitCode: number; output: string } {
  let output = "";
  const exitCode = runCli({
    arguments_: params.arguments_,
    cwd: params.cwd,
    isGitHubActions: params.isGitHubActions ?? false,
    today: TODAY,
    write: (text) => {
      output += text;
    },
  });
  return { exitCode, output };
}

/** Creates a repository whose first commit is tagged `base`. */
function createRepository(files: Record<string, string>): string {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "removed-env-vars-"));
  temporaryDirectories.push(cwd);
  git(cwd, ["init", "--quiet", "--initial-branch=main"]);
  writeFiles(cwd, { ".gitignore": "node_modules/\n" });
  commitFiles(cwd, files);
  git(cwd, ["tag", "base"]);
  return cwd;
}

function commitFiles(cwd: string, files: Record<string, string>): void {
  writeFiles(cwd, files);
  git(cwd, ["add", "--all"]);
  git(cwd, ["commit", "--quiet", "--allow-empty", "--message", "change"]);
}

function writeFiles(cwd: string, files: Record<string, string>): void {
  for (const [filePath, source] of Object.entries(files)) {
    const absolutePath = path.join(cwd, filePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, source);
  }
}

function git(cwd: string, arguments_: string[]): void {
  execFileSync(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...arguments_],
    {
      cwd,
      // Ignore the developer's global settings, such as commit and tag signing.
      env: { ...process.env, GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: "1" },
      stdio: "ignore",
    },
  );
}
