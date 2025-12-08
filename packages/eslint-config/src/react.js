module.exports = {
  extends: ["./index", "xo-react/space"],
  rules: {
    // Adds bloat, and is redundant with no-param-reassign
    "react/prefer-read-only-props": "off",

    // Not the recommended way of specifying default params for functional components
    "react/require-default-props": "off",
  },
  parserOptions: {
    project: "tsconfig.json",
  },
};
