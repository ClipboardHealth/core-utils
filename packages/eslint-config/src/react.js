module.exports = {
  extends: ["./index", "xo-react/space"],
  rules: {
    // Adds bloat, and is redundant with no-param-reassign
    "react/prefer-read-only-props": "off",
  },
  parserOptions: {
    project: ["tsconfig.json"],
    tsconfigRootDir: __dirname,
  },
};
