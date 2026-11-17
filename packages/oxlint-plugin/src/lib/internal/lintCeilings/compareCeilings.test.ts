import type { LintCeilings } from "./ceilingsFile";
import { type ChangedFile, findIncreases, tightenCeilings } from "./compareCeilings";
import type { Measured, Measurements } from "./measure";

function ceilings(rules: LintCeilings["rules"]): LintCeilings {
  return { rules, version: 1 };
}

function measurements(values: Record<string, Record<string, Measured>>): Measurements {
  return new Map(
    Object.entries(values).map(([file, rules]) => [file, new Map(Object.entries(rules))]),
  );
}

function modified(file: string): ChangedFile {
  return { basePath: file, headPath: file };
}

function increases(params: {
  base?: LintCeilings;
  baseMeasurements?: Measurements;
  changedFiles?: ChangedFile[];
  head?: LintCeilings;
  headMeasurements?: Measurements;
}): string[] {
  const listed = ceilings({ complexity: { "src/a.ts": 40 }, "max-lines": { "src/a.ts": 2500 } });
  return findIncreases({
    baseCeilings: params.base ?? listed,
    baseMeasurements: params.baseMeasurements ?? new Map(),
    changedFiles: params.changedFiles ?? [modified("src/a.ts")],
    headCeilings: params.head ?? listed,
    headMeasurements: params.headMeasurements ?? new Map(),
  }).map((increase) => increase.message);
}

describe("findIncreases", () => {
  it("fails a listed file that grew, even below its stale ceiling", () => {
    expect(
      increases({
        baseMeasurements: measurements({
          "src/a.ts": { "max-lines": { excess: 2300, max: 2300 } },
        }),
        headMeasurements: measurements({
          "src/a.ts": { "max-lines": { excess: 2310, max: 2310 } },
        }),
      }),
    ).toStrictEqual([
      "src/a.ts is listed in lint-ceilings.json for max-lines: it may not grow (base: 2300; now: 2310). Shrink or split it.",
    ]);
  });

  it("fails a new complex function in a listed file even when the file's max holds", () => {
    // Base: one function at 40 against a default of 20. Head adds a function at 22.
    expect(
      increases({
        baseMeasurements: measurements({ "src/a.ts": { complexity: { excess: 20, max: 40 } } }),
        headMeasurements: measurements({ "src/a.ts": { complexity: { excess: 22, max: 40 } } }),
      }),
    ).toStrictEqual([
      "src/a.ts is listed in lint-ceilings.json for complexity: it may not grow (base: max 40, 20 over the default in total; now: max 40, 22 over the default in total). Shrink or split it.",
    ]);
  });

  it("fails a listed file whose largest function grew while the total fell", () => {
    expect(
      increases({
        baseMeasurements: measurements({ "src/a.ts": { complexity: { excess: 30, max: 35 } } }),
        headMeasurements: measurements({ "src/a.ts": { complexity: { excess: 21, max: 41 } } }),
      }),
    ).toHaveLength(1);
  });

  it("passes splitting a complex function into smaller ones above the default", () => {
    // 40 becomes 25 + 25: the max and the total excess (20 -> 10) both fall.
    expect(
      increases({
        baseMeasurements: measurements({ "src/a.ts": { complexity: { excess: 20, max: 40 } } }),
        headMeasurements: measurements({ "src/a.ts": { complexity: { excess: 10, max: 25 } } }),
      }),
    ).toStrictEqual([]);
  });

  it("passes shrinking, staying put, dropping within the default, and deleting", () => {
    const base = measurements({ "src/a.ts": { "max-lines": { excess: 2300, max: 2300 } } });

    expect(
      increases({
        baseMeasurements: base,
        headMeasurements: measurements({
          "src/a.ts": { "max-lines": { excess: 2200, max: 2200 } },
        }),
      }),
    ).toStrictEqual([]);
    expect(increases({ baseMeasurements: base, headMeasurements: base })).toStrictEqual([]);
    expect(increases({ baseMeasurements: base, headMeasurements: new Map() })).toStrictEqual([]);
    expect(
      increases({
        baseMeasurements: base,
        changedFiles: [{ basePath: "src/a.ts", headPath: undefined }],
      }),
    ).toStrictEqual([]);
  });

  it("fails a listed file that rose above the default from within it", () => {
    expect(
      increases({
        headMeasurements: measurements({ "src/a.ts": { complexity: { excess: 1, max: 21 } } }),
      }),
    ).toStrictEqual([
      "src/a.ts is listed in lint-ceilings.json for complexity: it may not grow (base: within the default; now: max 21, 1 over the default in total). Shrink or split it.",
    ]);
  });

  it("ignores growth in files that are not listed", () => {
    expect(
      increases({
        changedFiles: [modified("src/other.ts")],
        headMeasurements: measurements({ "src/other.ts": { complexity: { excess: 5, max: 25 } } }),
      }),
    ).toStrictEqual([]);
  });

  it("fails added and raised entries, and passes lowered and removed ones", () => {
    expect(
      increases({
        base: ceilings({ complexity: { "src/a.ts": 40, "src/b.ts": 30, "src/c.ts": 30 } }),
        changedFiles: [],
        head: ceilings({
          complexity: { "src/a.ts": 41, "src/b.ts": 25 },
          "max-lines": { "src/d.ts": 1500 },
        }),
      }),
    ).toStrictEqual([
      "src/a.ts: complexity ceiling raised from 40 to 41 in lint-ceilings.json.",
      "src/d.ts: new max-lines entry (1500) in lint-ceilings.json.",
    ]);
  });

  it("lets an entry follow its file's rename without raising it", () => {
    const base = ceilings({ "max-lines": { "src/old.ts": 2500 } });
    const renamed: ChangedFile = { basePath: "src/old.ts", headPath: "src/new.ts" };
    const baseMeasurements = measurements({
      "src/old.ts": { "max-lines": { excess: 2400, max: 2400 } },
    });

    expect(
      increases({
        base,
        baseMeasurements,
        changedFiles: [renamed],
        head: ceilings({ "max-lines": { "src/new.ts": 2500 } }),
        headMeasurements: measurements({
          "src/new.ts": { "max-lines": { excess: 2400, max: 2400 } },
        }),
      }),
    ).toStrictEqual([]);
    expect(
      increases({
        base,
        baseMeasurements,
        changedFiles: [renamed],
        head: ceilings({ "max-lines": { "src/new.ts": 2600 } }),
        headMeasurements: measurements({
          "src/new.ts": { "max-lines": { excess: 2450, max: 2450 } },
        }),
      }),
    ).toStrictEqual([
      "src/new.ts: max-lines ceiling raised from 2500 to 2600 in lint-ceilings.json.",
      "src/new.ts is listed in lint-ceilings.json for max-lines: it may not grow (base: 2400; now: 2450). Shrink or split it.",
    ]);
  });

  it("treats an entry for an added file as new", () => {
    expect(
      increases({
        base: ceilings({}),
        changedFiles: [{ basePath: undefined, headPath: "src/a.ts" }],
        head: ceilings({ "max-lines": { "src/a.ts": 2500 } }),
      }),
    ).toStrictEqual(["src/a.ts: new max-lines entry (2500) in lint-ceilings.json."]);
  });
});

describe("tightenCeilings", () => {
  it("lowers stale values, keeps current ones, drops missing and within-default files, never raises", () => {
    const result = tightenCeilings({
      ceilings: ceilings({
        complexity: { "src/a.ts": 40, "src/b.ts": 30, "src/gone.ts": 50 },
        "max-lines": { "src/a.ts": 2500, "src/c.ts": 1200 },
      }),
      exists: (file) => file !== "src/gone.ts",
      measurements: measurements({
        "src/a.ts": {
          complexity: { excess: 15, max: 35 },
          "max-lines": { excess: 2600, max: 2600 },
        },
        "src/b.ts": { complexity: { excess: 10, max: 30 } },
      }),
    });

    expect(result).toStrictEqual({
      ceilings: ceilings({
        complexity: { "src/a.ts": 35, "src/b.ts": 30 },
        "max-lines": { "src/a.ts": 2500 },
      }),
      changes: [
        "complexity src/a.ts: 40 -> 35.",
        "complexity src/gone.ts: removed (file not found).",
        "max-lines src/c.ts: removed (within the default).",
      ],
    });
  });
});
