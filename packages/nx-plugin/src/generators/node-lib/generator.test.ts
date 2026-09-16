import { readProjectConfiguration, type Tree, updateJson } from "@nx/devkit";
import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";

import generator from "./generator";

function readWorkspaceFile(tree: Tree, path: string): string {
  const fileContents = tree.read(path, "utf8");

  if (fileContents === null) {
    throw new Error(`Expected ${path} to exist`);
  }

  return fileContents;
}

describe(generator, () => {
  let appTree: Tree;

  beforeEach(() => {
    appTree = createTreeWithEmptyWorkspace({ layout: "apps-libs" });
  });

  it("generates", async () => {
    const name = "test";

    await generator(appTree, { name, publishPublicly: false });

    const config = readProjectConfiguration(appTree, name);
    expect(config.name).toBe(name);
    expect(config.targets?.["lint"]?.executor).toBe("@nx/eslint:lint");
    expect(appTree.exists(`libs/${name}/.eslintrc.json`)).toBe(true);
  });

  it.each([
    { workspaceName: "@clipboard-health/core-utils", expected: "@clipboard-health/test" },
    { workspaceName: "workspace", expected: "test" },
  ])("derives the library import path from $workspaceName", async ({ workspaceName, expected }) => {
    updateJson<{ name?: string }>(appTree, "package.json", (packageJson) => ({
      ...packageJson,
      name: workspaceName,
    }));

    await generator(appTree, { name: "test", publishPublicly: false });

    const packageJson = JSON.parse(readWorkspaceFile(appTree, "libs/test/package.json"));
    const tsconfig = JSON.parse(readWorkspaceFile(appTree, "tsconfig.base.json"));
    expect(packageJson.name).toBe(expected);
    expect(tsconfig.compilerOptions.paths[expected]).toStrictEqual(["libs/test/src/index.ts"]);
  });

  it("generates an unscoped library without a root package.json", async () => {
    appTree.delete("package.json");

    await generator(appTree, { name: "test", publishPublicly: false });

    const packageJson = JSON.parse(readWorkspaceFile(appTree, "libs/test/package.json"));
    expect(packageJson.name).toBe("test");
  });

  it("generates public publish metadata when requested", async () => {
    const name = "public-test";

    await generator(appTree, { name, publishPublicly: true });

    const packageJson = JSON.parse(readWorkspaceFile(appTree, `libs/${name}/package.json`));

    expect(packageJson.publishConfig.access).toBe("public");
    expect(packageJson.repository).toStrictEqual({
      directory: `packages/${name}`,
      type: "git",
      url: "git+https://github.com/ClipboardHealth/core-utils.git",
    });
  });
});
