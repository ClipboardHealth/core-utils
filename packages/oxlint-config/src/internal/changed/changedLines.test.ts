import { filterChangedDiagnostics, type OxlintDiagnostic, parseAddedLines } from "./changedLines";

const DIFF = `diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -3,0 +4,2 @@ export function a() {
+const x = 1;
+const y = 2;
@@ -10 +12 @@ function b() {
-old
+new
diff --git a/src/deleted-lines-only.ts b/src/deleted-lines-only.ts
--- a/src/deleted-lines-only.ts
+++ b/src/deleted-lines-only.ts
@@ -5,2 +4,0 @@
-gone
-gone
diff --git a/src/new.ts b/src/new.ts
new file mode 100644
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,3 @@
+line 1
+line 2
+line 3
`;

describe("parseAddedLines", () => {
  it("maps each file to the new-side lines its hunks add", () => {
    const actual = parseAddedLines({ diff: DIFF });

    expect(
      Object.fromEntries([...actual].map(([file, lines]) => [file, [...lines]])),
    ).toStrictEqual({
      "src/a.ts": [4, 5, 12],
      "src/new.ts": [1, 2, 3],
    });
  });
});

describe("parseAddedLines path handling", () => {
  it("strips the tab git appends to paths with spaces", () => {
    const actual = parseAddedLines({
      diff: "diff --git a/with space.ts b/with space.ts\n--- a/with space.ts\t\n+++ b/with space.ts\t\n@@ -1 +1 @@\n-a\n+b\n",
    });

    expect([...actual.keys()]).toStrictEqual(["with space.ts"]);
  });

  it("skips quoted paths instead of crediting their hunks to the previous file", () => {
    const actual = parseAddedLines({
      diff: [
        "diff --git a/src/a.ts b/src/a.ts",
        "+++ b/src/a.ts",
        "@@ -1 +1 @@",
        "+a",
        'diff --git "a/q\\"uote.ts" "b/q\\"uote.ts"',
        '+++ "b/q\\"uote.ts"',
        "@@ -1 +7 @@",
        "+b",
        "",
      ].join("\n"),
    });

    expect(
      Object.fromEntries([...actual].map(([file, lines]) => [file, [...lines]])),
    ).toStrictEqual({
      "src/a.ts": [1],
    });
  });
});

describe("filterChangedDiagnostics", () => {
  const source = "// café ☕\nfunction load(\n  a: string,\n  b: string,\n) {}\n";
  const bytes = Buffer.from(source);
  const spanStart = bytes.indexOf("a: string");
  const spanEnd = bytes.indexOf("b: string") + "b: string".length;

  function diagnosticOnParameters(): OxlintDiagnostic {
    return {
      code: "@clipboard-health(no-ambiguous-positional-parameters)",
      filename: "src/a.ts",
      labels: [{ span: { column: 3, length: spanEnd - spanStart, line: 3, offset: spanStart } }],
      message: "ambiguous",
      severity: "error",
    };
  }

  it("keeps a diagnostic when any line of its span was added", () => {
    const actual = filterChangedDiagnostics({
      addedLines: new Map([["src/a.ts", new Set([4])]]),
      diagnostics: [diagnosticOnParameters()],
      readFile: () => bytes,
    });

    expect(actual).toStrictEqual([
      {
        code: "@clipboard-health(no-ambiguous-positional-parameters)",
        column: 3,
        filename: "src/a.ts",
        line: 3,
        message: "ambiguous",
      },
    ]);
  });

  it("drops diagnostics outside added lines and in unchanged files", () => {
    const actual = filterChangedDiagnostics({
      addedLines: new Map([["src/a.ts", new Set([1, 5])]]),
      diagnostics: [
        diagnosticOnParameters(),
        { ...diagnosticOnParameters(), filename: "src/b.ts" },
      ],
      readFile: () => bytes,
    });

    expect(actual).toStrictEqual([]);
  });
});
