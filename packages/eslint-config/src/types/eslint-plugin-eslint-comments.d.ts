declare module "eslint-plugin-eslint-comments" {
  import type { ESLint, Linter } from "eslint";

  const plugin: ESLint.Plugin & {
    configs: {
      recommended: Linter.Config;
    };
  };

  export = plugin;
}
