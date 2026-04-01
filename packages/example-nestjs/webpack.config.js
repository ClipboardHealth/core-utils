/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, unicorn/import-style */
const { NxAppWebpackPlugin } = require("@nx/webpack/app-plugin");
const { join } = require("node:path");
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, unicorn/import-style */

module.exports = {
  output: {
    path: join(__dirname, "..", "..", "dist", "apps", "nx-nest"),
  },
  module: {
    rules: [
      {
        test: /\.([jt])sx?$/,
        loader: "ts-loader",
        exclude: /node_modules/,
        options: {
          configFile: join(__dirname, "tsconfig.build.json"),
          transpileOnly: false,
          experimentalWatchApi: true,
        },
      },
    ],
  },
  plugins: [
    new NxAppWebpackPlugin({
      compiler: false,
      generatePackageJson: true,
      main: "./src/main.ts",
      optimization: false,
      outputHashing: "none",
      target: "node",
      tsConfig: "./tsconfig.build.json",
    }),
  ],
};
