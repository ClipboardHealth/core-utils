declare module "eslint-config-prettier" {
  import type { Linter } from "eslint";

  const config: Linter.Config;
  export = config;
}
