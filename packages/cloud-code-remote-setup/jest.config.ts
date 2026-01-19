module.exports = {
  coverageDirectory: "../../coverage/packages/cloud-code-remote-setup",
  coveragePathIgnorePatterns: ["src/bin/"],
  coverageThreshold: {
    global: {
      branches: 20,
      functions: 20,
      lines: 20,
      statements: 20,
    },
  },
  displayName: "cloud-code-remote-setup",
  moduleFileExtensions: ["ts", "js"],
  preset: "../../jest.preset.js",
  testEnvironment: "node",
  transform: {
    "^.+\\.[tj]s$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.spec.json" }],
  },
};
