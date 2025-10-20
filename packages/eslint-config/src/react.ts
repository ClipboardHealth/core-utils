import type { Linter } from "eslint";

// Use require for CommonJS modules
const baseConfig = require("./index") as Linter.Config[];
const xoReactModule = require("eslint-config-xo-react");

// Helper to get default export from ES modules
const getDefault = (module: any): any => module.default || module;
const xoReact = getDefault(xoReactModule);

module.exports = [
  ...baseConfig,
  ...xoReact,
  {
    rules: {
      // Adds bloat, and is redundant with no-param-reassign
      "react/prefer-read-only-props": "off",
    },
  },
];
