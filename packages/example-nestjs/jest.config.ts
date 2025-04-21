export default {
  coverageDirectory: "../../coverage/packages/example-nestjs",
  coveragePathIgnorePatterns: [],
  displayName: "example-nestjs",
  moduleFileExtensions: ["ts", "js"],
  preset: "../../jest.preset.js",
  testEnvironment: "node",
  transform: {
    "^.+\\.[tj]s$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.spec.json" }],
  },
};
