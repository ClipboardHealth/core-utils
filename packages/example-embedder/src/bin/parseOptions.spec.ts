import { parseOptions } from "./parseOptions";

describe("parseOptions", () => {
  const mockProcessArgv = process.argv;

  beforeEach(() => {
    process.argv = ["node", "script.js"];
  });

  afterEach(() => {
    process.argv = mockProcessArgv;
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

  it("sets custom directory when --directory provided", () => {
    process.argv.push("--directory", "custom/directory");

    const actual = parseOptions();

    expect(actual).toEqual({
      check: false,
      directory: "custom/directory",
    });
  });

  it("uses default directory when --directory flag has no value", () => {
    process.argv.push("--directory");

    const actual = parseOptions();

    expect(actual).toEqual({
      check: false,
      directory: "examples",
    });
  });
});
