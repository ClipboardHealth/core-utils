import { readProjectConfiguration, type Tree } from "@nx/devkit";
import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";

import generator from "./generator";

describe("generator", () => {
  let appTree: Tree;

  beforeEach(() => {
    appTree = createTreeWithEmptyWorkspace({ layout: "apps-libs" });
  });

  it("runs successfully", async () => {
    const name = "test";
    await generator(appTree, { name });
    const config = readProjectConfiguration(appTree, name);
    expect(config).toBeDefined();
  });
});
