export default {
  coverageDirectory: "../../coverage/packages/json-api-nestjs",
  coveragePathIgnorePatterns: [],
  displayName: "json-api-nestjs",
  moduleFileExtensions: ["ts", "js"],
  preset: "../../jest.preset.js",
  testEnvironment: "node",
  transform: {
    "^.+\\.[tj]s$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.spec.json" }],
  },
};
