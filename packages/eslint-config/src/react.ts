import xoReactModule from "eslint-config-xo-react";

import baseConfig from "./index";

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
