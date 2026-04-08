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
});
