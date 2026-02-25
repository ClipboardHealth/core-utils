module.exports = {
  coverageDirectory: "../../coverage/packages/playwright-reporter-llm",
  coveragePathIgnorePatterns: [],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 100,
      lines: 90,
      statements: 90,
    },
  },
  displayName: "playwright-reporter-llm",
  moduleFileExtensions: ["ts", "js"],
  preset: "../../jest.preset.js",
  testEnvironment: "node",
  testPathIgnorePatterns: ["/test/e2e/fixtures/"],
  transform: {
    "^.+\\.[tj]s$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.spec.json" }],
  },
};
