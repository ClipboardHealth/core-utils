/* eslint-disable */
export default {
  coverageDirectory: "../../coverage/packages/nx-plugin",
  coveragePathIgnorePatterns: [],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 100,
      lines: 95,
      statements: 95,
    },
  },
  displayName: "nx-plugin",
  moduleFileExtensions: ["ts", "js"],
  preset: "../../jest.preset.js",
  testEnvironment: "node",
  transform: {
    "^.+\\.[tj]s$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.spec.json" }],
  },
};
