const baseConfig = require("./index");
const xoReactModule = require("eslint-config-xo-react");
const xoReact = xoReactModule.default || xoReactModule;

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
