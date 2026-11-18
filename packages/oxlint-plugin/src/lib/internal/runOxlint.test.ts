import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { runOxlint } from "./runOxlint";

const NOTICE = "No files found to lint. Please check your paths and ignore patterns.\n";

describe("runOxlint reports", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), "oxlint-report-"));
    const tool = path.join(directory, "node_modules/oxlint");
    mkdirSync(path.join(tool, "bin"), { recursive: true });
    writeFileSync(path.join(tool, "package.json"), '{"name":"oxlint"}');
    writeFileSync(path.join(directory, "package.json"), '{"private":true}');
  });

  afterEach(() => {
    rmSync(directory, { force: true, recursive: true });
  });

  function report(params: { output: string; status: number }) {
    writeFileSync(
      path.join(directory, "node_modules/oxlint/bin/oxlint"),
      `process.stdout.write(${JSON.stringify(params.output)}); process.exit(${params.status});`,
    );
    return () => runOxlint({ args: ["--format=json"], cwd: directory });
  }

  it("accepts the ignored-file notice with an empty zero-file JSON report", () => {
    const run = report({
      output: NOTICE + JSON.stringify({ diagnostics: [], number_of_files: 0 }),
      status: 1,
    });

    expect(run()).toStrictEqual({ diagnostics: [] });
  });

  it("rejects a notice that claims files were evaluated", () => {
    expect(
      report({
        output: NOTICE + JSON.stringify({ diagnostics: [], number_of_files: 1 }),
        status: 1,
      }),
    ).toThrow();
  });

  it("rejects arbitrary non-JSON output", () => {
    expect(report({ output: "unexpected tool output", status: 0 })).toThrow();
  });

  it("rejects tool failures even when their output resembles an empty report", () => {
    expect(
      report({
        output: NOTICE + JSON.stringify({ diagnostics: [], number_of_files: 0 }),
        status: 2,
      }),
    ).toThrow("oxlint exited with status 2");
  });

  it("keeps normal diagnostics from an exit-one JSON report", () => {
    const diagnostic = { code: "probe", filename: "probe.ts", message: "a real violation" };
    const run = report({ output: JSON.stringify({ diagnostics: [diagnostic] }), status: 1 });

    expect(run()).toStrictEqual({ diagnostics: [{ ...diagnostic, span: undefined }] });
  });
});
