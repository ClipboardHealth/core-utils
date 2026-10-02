/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
const { NxAppWebpackPlugin } = require("@nx/webpack/app-plugin");
const { existsSync } = require("node:fs");
const path = require("node:path");
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */

const packageModulesDirectory = path.join(__dirname, "node_modules");

module.exports = {
  externals: [
    /**
     * Nx only externalizes packages found in the root node_modules. Isolated installs (pnpm, aube)
     * link this package's dependencies under its own node_modules, so externalize those too.
     *
     * @param {{ request?: string }} data
     * @param {(error?: Error | null, result?: string) => void} callback
     */
    ({ request }, callback) => {
      const packageName = request?.match(/^(?:@[^/]+\/)?[^./][^/]*/)?.[0];
      if (
        packageName !== undefined &&
        existsSync(path.join(packageModulesDirectory, packageName))
      ) {
        callback(null, `commonjs ${request}`);
        return;
      }

      callback();
    },
  ],
  output: {
    path: path.join(__dirname, "..", "..", "dist", "apps", "nx-nest"),
  },
  plugins: [
    new NxAppWebpackPlugin({
      compiler: "tsc",
      generatePackageJson: true,
      main: "./src/main.ts",
      mergeExternals: true,
      optimization: false,
      outputHashing: "none",
      target: "node",
      tsConfig: "./tsconfig.build.json",
    }),
  ],
};
