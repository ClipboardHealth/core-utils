import config from "./react";

describe("eslint-config", () => {
  it("matches", () => {
    expect(config).toEqual({
      extends: ["./index", "xo-react/space"],
      parserOptions: {
        project: ["tsconfig.json"],
        tsconfigRootDir: __dirname,
      },
    });
  });
});
