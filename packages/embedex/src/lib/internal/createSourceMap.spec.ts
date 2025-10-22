import { stripSourceMarker } from "./createSourceMap";

describe("stripSourceMarker", () => {
  it("strips source marker line when present", () => {
    const content = "// embedex: dest.md\nconst x = 1;\nconsole.log(x);";

    const actual = stripSourceMarker(content);

    expect(actual).toBe("const x = 1;\nconsole.log(x);");
  });

  it("returns content unchanged when source marker not present", () => {
    const content = "const x = 1;\nconsole.log(x);";

    const actual = stripSourceMarker(content);

    expect(actual).toBe("const x = 1;\nconsole.log(x);");
  });
});
