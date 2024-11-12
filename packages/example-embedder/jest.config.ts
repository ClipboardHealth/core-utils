export default {
  coverageDirectory: "../../coverage/packages/example-embedder",
  coveragePathIgnorePatterns: ["<rootDir>/src/bin/cli.ts"],
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
  displayName: "example-embedder",
  moduleFileExtensions: ["ts", "js"],
  preset: "../../jest.preset.js",
  testEnvironment: "node",
  transform: {
    "^.+\\.[tj]s$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.spec.json" }],
  },
  watchPathIgnorePatterns: [
    "<rootDir>/test-1",
    "<rootDir>/test-2",
    "<rootDir>/test-3",
    "<rootDir>/test-4",
    "<rootDir>/test-5",
  ],
};
