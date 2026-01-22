module.exports = {
  coverageDirectory: "../../coverage/packages/phone-number",
  coveragePathIgnorePatterns: [],
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
  displayName: "phone-number",
  moduleFileExtensions: ["ts", "js"],
  preset: "../../jest.preset.js",
  testEnvironment: "node",
  transform: {
    "^.+\\.[tj]s$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.spec.json" }],
  },
};
