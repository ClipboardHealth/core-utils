import { parseOptions } from "./parseOptions";

describe("parseOptions", () => {
  const originalProcessArgv = process.argv;

  beforeEach(() => {
    process.argv = ["node", "script.js"];
  });

  afterEach(() => {
    process.argv = originalProcessArgv;
  });

  it("returns default options when no flags provided", () => {
    const actual = parseOptions();

    expect(actual).toEqual({
      check: false,
      directory: "examples",
    });
  });

  it("sets check flag when --check provided", () => {
    process.argv.push("--check");

    const actual = parseOptions();

    expect(actual).toEqual({
      check: true,
      directory: "examples",
    });
  });

  it("sets custom directory when provided", () => {
    process.argv.push("custom/directory");

    const actual = parseOptions();

    expect(actual).toEqual({
      check: false,
      directory: "custom/directory",
    });
  });

  it("uses default directory", () => {
    const actual = parseOptions();

    expect(actual).toEqual({
      check: false,
      directory: "examples",
    });
  });
});
