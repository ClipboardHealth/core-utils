import colors from "yoctocolors-cjs";

import { processResult } from "./processResult";

describe("processResult", () => {
  const destination = "destinations/path";
  const sources = ["sources/path"];
  const base = {
    check: false,
    cwd: process.cwd(),
    result: { embeds: [], sources: [], destinations: [] },
    verbose: false,
  };

  it("returns error when check is true on 'UPDATE'", () => {
    const input = {
      ...base,
      check: true,
      result: {
        ...base.result,
        embeds: [{ code: "UPDATE" as const, paths: { destination, sources }, updatedContent: "" }],
      },
    };

    const actual = processResult(input);

    expect(actual).toEqual([
      {
        code: "UPDATE",
        isError: true,
        message: `${colors.red("UPDATE")} ${colors.gray(destination)} -> ${colors.gray(sources.join(", "))}`,
      },
    ]);
  });

  it("returns empty array when result is empty", () => {
    const actual = processResult(base);

    expect(actual).toEqual([]);
  });

  it("logs additional data when verbose is true", () => {
    const actual = processResult({
      ...base,
      result: {
        ...base.result,
        sources: [{ path: "sources/path", destinations: [destination] }],
        destinations: [{ path: destination, sources: ["sources/path"] }],
      },
      verbose: true,
    });

    expect(actual).toEqual([]);
  });

  it("sorts output by code", () => {
    const input = {
      ...base,
      result: {
        ...base.result,
        embeds: [
          { code: "UPDATE" as const, paths: { destination, sources }, updatedContent: "" },
          { code: "NO_MATCH" as const, paths: { destination, sources } },
          { code: "NO_CHANGE" as const, paths: { destination, sources } },
        ],
      },
    };

    const actual = processResult(input);

    expect(actual).toEqual([
      {
        code: "NO_CHANGE",
        isError: false,
        message: `${colors.green("NO_CHANGE")} ${colors.gray(destination)} -> ${colors.gray(sources.join(", "))}`,
      },
      {
        code: "NO_MATCH",
        isError: true,
        message: `${colors.red("NO_MATCH")} ${colors.gray(destination)} -> ${colors.gray(sources.join(", "))}`,
      },
      {
        code: "UPDATE",
        isError: false,
        message: `${colors.green("UPDATE")} ${colors.gray(destination)} -> ${colors.gray(sources.join(", "))}`,
      },
    ]);
  });

  it("returns error for INVALID_SOURCE", () => {
    const invalidSources = ["missing/file1.ts", "missing/file2.ts"];
    const input = {
      ...base,
      result: {
        ...base.result,
        embeds: [
          {
            code: "INVALID_SOURCE" as const,
            paths: { destination, sources: [] },
            invalidSources,
          },
        ],
      },
    };

    const actual = processResult(input);

    expect(actual).toEqual([
      {
        code: "INVALID_SOURCE",
        isError: true,
        message: `${colors.red("INVALID_SOURCE")} ${colors.gray(destination)} -> ${colors.gray("missing: missing/file1.ts, missing/file2.ts")}`,
      },
    ]);
  });

  it("returns error for UNREFERENCED_SOURCE", () => {
    const unreferencedSources = ["sources/unreferenced1.ts", "sources/unreferenced2.ts"];
    const input = {
      ...base,
      result: {
        ...base.result,
        embeds: [
          {
            code: "UNREFERENCED_SOURCE" as const,
            paths: { destination, sources: [] },
            unreferencedSources,
          },
        ],
      },
    };

    const actual = processResult(input);

    expect(actual).toEqual([
      {
        code: "UNREFERENCED_SOURCE",
        isError: true,
        message: `${colors.red("UNREFERENCED_SOURCE")} ${colors.gray(destination)} -> ${colors.gray("not referenced: sources/unreferenced1.ts, sources/unreferenced2.ts")}`,
      },
    ]);
  });

  it("returns error for CIRCULAR_DEPENDENCY", () => {
    const cycle = ["sources/a.md", "sources/b.md", "sources/a.md"];
    const input = {
      ...base,
      result: {
        ...base.result,
        embeds: [
          {
            code: "CIRCULAR_DEPENDENCY" as const,
            paths: { destination, sources: [] },
            cycle,
          },
        ],
      },
    };

    const actual = processResult(input);

    expect(actual).toEqual([
      {
        code: "CIRCULAR_DEPENDENCY",
        isError: true,
        message: `${colors.red("CIRCULAR_DEPENDENCY")} ${colors.gray("sources/a.md → sources/b.md → sources/a.md")}`,
      },
    ]);
  });
});
