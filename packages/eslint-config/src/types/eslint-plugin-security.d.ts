declare module "eslint-plugin-security" {
  import type { ESLint, Linter } from "eslint";

  const plugin: ESLint.Plugin & {
    configs: {
      recommended: Linter.Config;
    };
  };

  export = plugin;
}
