const nxPreset = require("@nx/jest/preset").default;

module.exports = {
  ...nxPreset,
  collectCoverageFrom: ["src/**", "!src/**/index.ts", "!src/generators/**/files/**"],
  coverageReporters: ["lcov", "text"],
};
