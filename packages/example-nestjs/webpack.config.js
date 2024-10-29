/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
const { NxAppWebpackPlugin } = require("@nx/webpack/app-plugin");
const { join } = require("node:path");
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */

module.exports = {
  output: {
    path: join(__dirname, "..", "..", "dist", "apps", "nx-nest"),
  },
  plugins: [
    new NxAppWebpackPlugin({
      compiler: "tsc",
      generatePackageJson: true,
      main: "./src/main.ts",
      optimization: false,
      outputHashing: "none",
      target: "node",
      tsConfig: "./tsconfig.build.json",
    }),
  ],
};
