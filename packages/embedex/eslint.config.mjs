import baseConfig from "../../eslint.config.mjs";

export default [
  {
    ignores: ["**/dist"],
  },
  ...baseConfig,
  {
    languageOptions: {
      parserOptions: {
        project: "tsconfig.lint.json",
        tsconfigRootDir: "packages/embedex",
      },
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    rules: {
      "security/detect-non-literal-fs-filename": "off",
    },
  },
  {
    files: ["./src/bin/**/*.ts"],
    rules: {
      "n/no-process-exit": "off",
      "n/shebang": "off",
      "no-console": "off",
      "unicorn/prefer-top-level-await": "off",
      "unicorn/no-process-exit": "off",
    },
  },
  {
    ignores: ["**/*.json", "!**/package.json"],
  },
];
