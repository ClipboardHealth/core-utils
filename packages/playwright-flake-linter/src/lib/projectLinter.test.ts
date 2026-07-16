import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runCli } from "../bin/runCli";
import type { PlaywrightFlakeLinterConfig } from "./playwrightFlakeLinter";
import { lintPlaywrightProject, loadPlaywrightFlakeLinterConfig } from "./projectLinter";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directoryPath) => {
      await rm(directoryPath, { force: true, recursive: true });
    }),
  );
});

describe("lintPlaywrightProject", () => {
  it("recursively scans configured roots and returns sorted violations", async () => {
    const cwd = await createTemporaryDirectory();
    const config = getConfig();
    await writeFixture({
      cwd,
      filePath: "playwright/z-last.spec.ts",
      source: "await page.waitForTimeout(200);",
    });
    await writeFixture({
      cwd,
      filePath: "playwright/nested/a-first.spec.ts",
      source: "await page.waitForResponse((response) => response.ok());",
    });
    await writeFixture({
      cwd,
      filePath: "outside/ignored.spec.ts",
      source: "await page.waitForTimeout(100);",
    });

    const actual = await lintPlaywrightProject({ config, cwd });

    expect(actual.map(({ filePath, ruleId }) => `${filePath}:${ruleId}`)).toEqual([
      "playwright/nested/a-first.spec.ts:response-wait",
      "playwright/z-last.spec.ts:fixed-sleep",
    ]);
  });

  it("supports a configured source file and ignores non-TypeScript files", async () => {
    const cwd = await createTemporaryDirectory();
    await writeFixture({
      cwd,
      filePath: "single.spec.tsx",
      source: "await page.waitForTimeout(100);",
    });
    await writeFixture({
      cwd,
      filePath: "ignored.txt",
      source: "await page.waitForTimeout(100);",
    });

    const actual = await lintPlaywrightProject({
      config: { scanRoots: ["single.spec.tsx"] },
      cwd,
    });

    expect(actual.map(({ ruleId }) => ruleId)).toEqual(["fixed-sleep"]);
  });
});

describe("loadPlaywrightFlakeLinterConfig", () => {
  it("loads a default-exported repository config fixture", async () => {
    const cwd = await createTemporaryDirectory();
    const configFilePath = path.join(cwd, "mobile.config.mjs");
    await writeFile(
      configFilePath,
      `export default ${JSON.stringify({
        scanRoots: ["playwright"],
        sharedReadinessMechanisms: [
          {
            directCallNames: ["waitForResponse"],
            filePathPattern: String.raw`playwright/e2e/sheets/.*\.spec\.ts$`,
            name: "BottomSheet readiness",
            sharedHelperNames: ["waitForBottomSheet"],
          },
        ],
      })};`,
      "utf8",
    );

    const actual = await loadPlaywrightFlakeLinterConfig({ configFilePath });

    expect(actual.scanRoots).toEqual(["playwright"]);
    expect(actual.sharedReadinessMechanisms?.[0]?.name).toBe("BottomSheet readiness");
  });

  it("rejects an invalid config module", async () => {
    const cwd = await createTemporaryDirectory();
    const configFilePath = path.join(cwd, "invalid.mjs");
    await writeFile(configFilePath, "export default {};", "utf8");

    await expect(loadPlaywrightFlakeLinterConfig({ configFilePath })).rejects.toThrow(
      "Invalid Playwright flake linter config",
    );
  });
});

describe("runCli", () => {
  it("prints actionable diagnostics and returns failure for violations", async () => {
    const cwd = await createTemporaryDirectory();
    const configFilePath = path.join(cwd, "playwright-flake-lint.config.mjs");
    await writeFile(configFilePath, `export default ${JSON.stringify(getConfig())};`, "utf8");
    await writeFixture({
      cwd,
      filePath: "playwright/example.spec.ts",
      source: "await page.waitForTimeout(100);",
    });
    const output: string[] = [];

    const actual = await runCli({
      arguments_: [],
      cwd,
      writeError: (value) => {
        output.push(value);
      },
    });

    expect(actual).toBe(1);
    expect(output.join("")).toContain("playwright/example.spec.ts:1:7 [fixed-sleep]");
    expect(output.join("")).toContain("flake-lint-allow fixed-sleep -- <reason>");
  });

  it("accepts an explicit config path and returns success without violations", async () => {
    const cwd = await createTemporaryDirectory();
    await writeFile(
      path.join(cwd, "custom.mjs"),
      `export default ${JSON.stringify(getConfig())};`,
      "utf8",
    );
    await writeFixture({
      cwd,
      filePath: "playwright/example.spec.ts",
      source: 'await expect(page.getByRole("heading")).toBeVisible();',
    });
    const output: string[] = [];

    const actual = await runCli({
      arguments_: ["--config", "custom.mjs"],
      cwd,
      writeError: (value) => {
        output.push(value);
      },
    });

    expect(actual).toBe(0);
    expect(output).toEqual([]);
  });

  it("rejects unsupported arguments", async () => {
    await expect(
      runCli({
        arguments_: ["--unknown"],
        cwd: process.cwd(),
        writeError: (value) => {
          process.stderr.write(value);
        },
      }),
    ).rejects.toThrow("Usage:");
  });
});

function getConfig(): PlaywrightFlakeLinterConfig {
  return {
    scanRoots: ["playwright"],
  };
}

async function createTemporaryDirectory(): Promise<string> {
  const directoryPath = await mkdtemp(path.join(os.tmpdir(), "playwright-flake-linter-"));
  temporaryDirectories.push(directoryPath);
  return directoryPath;
}

interface WriteFixtureParams {
  cwd: string;
  filePath: string;
  source: string;
}

async function writeFixture({ cwd, filePath, source }: WriteFixtureParams): Promise<void> {
  const absoluteFilePath = path.join(cwd, filePath);
  await mkdir(path.dirname(absoluteFilePath), { recursive: true });
  await writeFile(absoluteFilePath, source, "utf8");
}
