import colors from "yoctocolors-cjs";

import { processResult } from "./processResult";

describe("processResult", () => {
  const target = "target/path";
  const examples = ["example/path"];
  const base = {
    check: false,
    cwd: process.cwd(),
    result: { embeds: [], examples: [], targets: [] },
    verbose: false,
  };

  it("returns error when check is true on 'UPDATE'", () => {
    const input = {
      ...base,
      check: true,
      result: {
        ...base.result,
        embeds: [{ code: "UPDATE" as const, paths: { target, examples }, updatedContent: "" }],
      },
    };

    const actual = processResult(input);

    expect(actual).toEqual([
      {
        code: "UPDATE",
        isError: true,
        message: `${colors.green("UPDATE")} ${colors.gray(target)} -> ${colors.gray(examples.join(", "))}`,
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
        examples: [{ path: "example/path", targets: [target] }],
        targets: [{ path: target, examples: ["example/path"] }],
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
          { code: "UPDATE" as const, paths: { target, examples }, updatedContent: "" },
          { code: "NO_MATCH" as const, paths: { target, examples } },
          { code: "NO_CHANGE" as const, paths: { target, examples } },
          { code: "UNSUPPORTED" as const, paths: { target, examples } },
        ],
      },
    };

    const actual = processResult(input);

    expect(actual).toEqual([
      {
        code: "NO_CHANGE",
        isError: false,
        message: `${colors.green("NO_CHANGE")} ${colors.gray(target)} -> ${colors.gray(examples.join(", "))}`,
      },
      {
        code: "NO_MATCH",
        isError: true,
        message: `${colors.green("NO_MATCH")} ${colors.gray(target)} -> ${colors.gray(examples.join(", "))}`,
      },
      {
        code: "UNSUPPORTED",
        isError: true,
        message: `${colors.green("UNSUPPORTED")} ${colors.gray(target)} -> ${colors.gray(examples.join(", "))}`,
      },
      {
        code: "UPDATE",
        isError: false,
        message: `${colors.green("UPDATE")} ${colors.gray(target)} -> ${colors.gray(examples.join(", "))}`,
      },
    ]);
  });
});
