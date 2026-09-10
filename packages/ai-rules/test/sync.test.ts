import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { execAndLog } from "../scripts/execAndLog";

const PACKAGE_ROOT = path.join(__dirname, "..");
const WORKSPACE_ROOT = path.join(PACKAGE_ROOT, "..", "..");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe("sync script", () => {
  it("does not create a consumer .agents directory", async () => {
    const consumerRoot = await createConsumerProject();
    const installedPackageRoot = path.join(
      consumerRoot,
      "node_modules",
      "@clipboard-health",
      "ai-rules",
    );
    const legacyLibraryPath = path.join(installedPackageRoot, "lib");
    await mkdir(legacyLibraryPath, { recursive: true });
    await writeFile(path.join(legacyLibraryPath, "unused.ts"), "export {};\n", "utf8");

    await execAndLog({
      command: [
        process.execPath,
        "--import",
        "tsx",
        path.join(installedPackageRoot, "scripts", "sync.ts"),
        "common",
      ],
      cwd: WORKSPACE_ROOT,
      verbose: false,
    });

    await expect(access(path.join(consumerRoot, ".rules"))).resolves.toBeUndefined();
    await expect(access(path.join(consumerRoot, "AGENTS.md"))).resolves.toBeUndefined();
    await expect(access(path.join(consumerRoot, ".agents"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("leaves consumer Claude configuration untouched", async () => {
    const consumerRoot = await createConsumerProject();
    const claudeDirectory = path.join(consumerRoot, ".claude");
    const settingsPath = path.join(claudeDirectory, "settings.json");
    const expected = '{\n  "permissions": { "allow": ["Read"] }\n}\n';
    await mkdir(claudeDirectory, { recursive: true });
    await writeFile(settingsPath, expected, "utf8");

    await execAndLog({
      command: [
        process.execPath,
        "--import",
        "tsx",
        path.join(
          consumerRoot,
          "node_modules",
          "@clipboard-health",
          "ai-rules",
          "scripts",
          "sync.ts",
        ),
        "common",
      ],
      cwd: WORKSPACE_ROOT,
      verbose: false,
    });

    await expect(access(path.join(consumerRoot, "AGENTS.md"))).resolves.toBeUndefined();
    const actual = await readFile(settingsPath, "utf8");
    expect(actual).toBe(expected);
    await expect(access(path.join(claudeDirectory, "setup.sh"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});

async function createConsumerProject(): Promise<string> {
  const consumerRoot = await mkdtemp(path.join(tmpdir(), "ai-rules-consumer-"));
  temporaryDirectories.push(consumerRoot);
  const installedPackageRoot = path.join(
    consumerRoot,
    "node_modules",
    "@clipboard-health",
    "ai-rules",
  );
  await mkdir(installedPackageRoot, { recursive: true });
  await Promise.all([
    cp(path.join(PACKAGE_ROOT, "rules"), path.join(installedPackageRoot, "rules"), {
      recursive: true,
    }),
    cp(path.join(PACKAGE_ROOT, "scripts"), path.join(installedPackageRoot, "scripts"), {
      recursive: true,
    }),
  ]);

  return consumerRoot;
}
