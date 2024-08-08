import { readProjectConfiguration, type Tree } from "@nx/devkit";
import { createTreeWithEmptyWorkspace } from "@nx/devkit/testing";

import generator from "./generator";

describe("generator", () => {
  let appTree: Tree;

  beforeEach(() => {
    appTree = createTreeWithEmptyWorkspace({ layout: "apps-libs" });
  });

  it("uses restricted package access by default", async () => {
    const name = "test";

    await generator(appTree, { name });

    const config = readProjectConfiguration(appTree, name);
    expect(config.name).toBe(name);
  });
});
