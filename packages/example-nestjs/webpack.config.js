/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
const { NxAppWebpackPlugin } = require("@nx/webpack/app-plugin");
const { join } = require("node:path");
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */

module.exports = {
  output: {
    path: join(__dirname, "../../dist/apps/nx-nest"),
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: "node",
      compiler: "tsc",
      main: "./src/main.ts",
      tsConfig: "./tsconfig.build.json",
      optimization: false,
      outputHashing: "none",
      generatePackageJson: true,
    }),
  ],
};
