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
        message: `${colors.green("UPDATE")} ${colors.gray(destination)} -> ${colors.gray(sources.join(", "))}`,
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
        message: `${colors.green("NO_MATCH")} ${colors.gray(destination)} -> ${colors.gray(sources.join(", "))}`,
      },
      {
        code: "UPDATE",
        isError: false,
        message: `${colors.green("UPDATE")} ${colors.gray(destination)} -> ${colors.gray(sources.join(", "))}`,
      },
    ]);
  });
});
