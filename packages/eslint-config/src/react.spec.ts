import config from "./react";

describe("eslint-config", () => {
  it("matches", () => {
    expect(config).toEqual({
      extends: ["./index", "xo-react/space"],
      rules: {
        "react/prefer-read-only-props": "off",
      },
      parserOptions: {
        project: ["tsconfig.json"],
        tsconfigRootDir: __dirname,
      },
    });
  });
});
