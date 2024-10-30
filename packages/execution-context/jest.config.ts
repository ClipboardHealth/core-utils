export default {
  coverageDirectory: "../../coverage/packages/execution-context",
  coveragePathIgnorePatterns: [],
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
  displayName: "execution-context",
  moduleFileExtensions: ["ts", "js"],
  preset: "../../jest.preset.js",
  testEnvironment: "node",
  transform: {
    "^.+\\.[tj]s$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.spec.json" }],
  },
};
