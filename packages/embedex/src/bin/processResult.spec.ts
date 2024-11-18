import { processResult } from "./processResult";

describe("processResult", () => {
  it("returns error message when check is true and code is NO_MATCH", () => {
    const input = {
      check: true,
      dryRun: false,
      result: [{ code: "NO_MATCH" as const, paths: { target: "target/path", examples: [] } }],
    };

    const actual = processResult(input);

    expect(actual).toEqual({ isError: true, message: "[target/path] No embed targets found" });
  });

  it("returns error message when check is true and code is UPDATED", () => {
    const input = {
      check: true,
      dryRun: false,
      result: [
        {
          code: "UPDATED" as const,
          paths: { target: "target/path", examples: ["example1", "example2"] },
          updatedContent: "",
        },
      ],
    };

    const actual = processResult(input);

    expect(actual).toEqual({
      isError: true,
      message: "[target/path] Embed required example1, example2",
    });
  });

  it("returns dry run message when dryRun is true and code is NO_MATCH", () => {
    const input = {
      check: false,
      dryRun: true,
      result: [{ code: "NO_MATCH" as const, paths: { target: "target/path", examples: [] } }],
    };

    const actual = processResult(input);

    expect(actual).toEqual({
      isError: false,
      message: "[target/path] Would fail; no embed targets found",
    });
  });

  it("returns dry run message when dryRun is true and code is UPDATED", () => {
    const input = {
      check: false,
      dryRun: true,
      result: [
        {
          code: "UPDATED" as const,
          paths: { target: "target/path", examples: ["example1", "example2"] },
          updatedContent: "",
        },
      ],
    };

    const actual = processResult(input);

    expect(actual).toEqual({
      isError: false,
      message: "[target/path] Would embed example1, example2",
    });
  });

  it("returns no changes message when dryRun is true and code is NO_CHANGE", () => {
    const input = {
      check: false,
      dryRun: true,
      result: [{ code: "NO_CHANGE" as const, paths: { target: "target/path", examples: [] } }],
    };

    const actual = processResult(input);

    expect(actual).toEqual({ isError: false, message: "[target/path] No changes" });
  });

  it("returns error message when code is NO_MATCH", () => {
    const input = {
      check: false,
      dryRun: false,
      result: [{ code: "NO_MATCH" as const, paths: { target: "target/path", examples: [] } }],
    };

    const actual = processResult(input);

    expect(actual).toEqual({ isError: true, message: "[target/path] No embed targets found" });
  });

  it("returns embedded message when code is UPDATED", () => {
    const input = {
      check: false,
      dryRun: false,
      result: [
        {
          code: "UPDATED" as const,
          paths: { target: "target/path", examples: ["example1", "example2"] },
          updatedContent: "",
        },
      ],
    };

    const actual = processResult(input);

    expect(actual).toEqual({
      isError: false,
      message: "[target/path] Embedded example1, example2",
    });
  });

  it("returns empty message when no results are provided", () => {
    const input = { check: false, dryRun: false, result: [] };

    const actual = processResult(input);

    expect(actual).toEqual({ isError: false, message: "" });
  });
});
