import { readProjectConfiguration, type Tree } from "@nx/devkit";
import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";

import generator from "./generator";

describe("generator", () => {
  let appTree: Tree;

  beforeEach(() => {
    appTree = createTreeWithEmptyWorkspace({ layout: "apps-libs" });
  });

  it("generates", async () => {
    const name = "test";

    await generator(appTree, { name, publishPublicly: false });

    const config = readProjectConfiguration(appTree, name);
    expect(config.name).toBe(name);
  });

  it("generates public publish metadata when requested", async () => {
    const name = "public-test";

    await generator(appTree, { name, publishPublicly: true });

    const packageJson = JSON.parse(appTree.read(`libs/${name}/package.json`, "utf8") ?? "{}");

    expect(packageJson.publishConfig.access).toBe("public");
    expect(packageJson.repository).toEqual({
      directory: `packages/${name}`,
      type: "git",
      url: "git+https://github.com/ClipboardHealth/core-utils.git",
    });
  });
});
