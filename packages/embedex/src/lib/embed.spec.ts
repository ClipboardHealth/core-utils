import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { embed } from "./embed";
import { SOURCE_MARKER_PREFIX } from "./internal/createSourceMap";
import type { CircularDependency, Embed, Updated } from "./types";

describe("embed", () => {
  // eslint-disable-next-line no-template-curly-in-string
  const sourceACode = [`const x = "a";`, "", "console.log(`Got ${x}`);"];
  const destinationACode = [
    " *",
    " * ```ts",
    ` * const x = "a";`,
    " *",
    // eslint-disable-next-line no-template-curly-in-string
    " * console.log(`Got ${x}`);",
    " * ```",
    " *",
  ];
  const sourcesGlob = "sources/**/*.{md,ts}";
  let cwd: string;
  let paths: {
    sources: Record<"a" | "b" | "c", string>;
    destinations: Record<"l" | "m" | "n", string>;
  };

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), "embedex"));
    paths = {
      sources: { a: "sources/a.ts", b: "sources/b.ts", c: "sources/c.md" },
      destinations: { l: "src/l.ts", m: "src/m.ts", n: "src/n.md" },
    };
    await Promise.all([mkdir(path.join(cwd, "sources")), mkdir(path.join(cwd, "src"))]);
  });

  async function read(filePath: string) {
    return await readFile(path.join(cwd, filePath), "utf8");
  }

  async function write(filePath: string, content: string[]) {
    await writeFile(path.join(cwd, filePath), content.join("\n"), "utf8");
  }

  async function writeWithCrlf(filePath: string, content: string[]) {
    await writeFile(path.join(cwd, filePath), content.join("\r\n"), "utf8");
  }

  function toPath(filePath: string) {
    return path.join(cwd, filePath);
  }

  it("returns INVALID_SOURCE for non-existent sources", async () => {
    await Promise.all([
      write(paths.sources.a, [`${SOURCE_MARKER_PREFIX}${paths.destinations.l}`, ...sourceACode]),
      write(paths.destinations.l, [
        "/**",
        " * @example",
        ` * <embedex source="${paths.sources.b}">`,
        " * </embedex>",
        " */",
      ]),
    ]);

    const actual = await embed({ sourcesGlob, cwd, write: false });

    expect(actual.embeds).toEqual([
      {
        code: "INVALID_SOURCE",
        paths: { sources: [], destination: toPath(paths.destinations.l) },
        invalidSources: [toPath(paths.sources.b)],
      },
    ]);
  });

  it("returns UNREFERENCED_SOURCE when source declares destination but has no embedex tag", async () => {
    await Promise.all([
      write(paths.sources.a, [`${SOURCE_MARKER_PREFIX}${paths.destinations.l}`, ...sourceACode]),
      write(paths.destinations.l, [
        "/**",
        " * @example",
        " * Some content without embedex tag",
        " */",
      ]),
    ]);

    const actual = await embed({ sourcesGlob, cwd, write: false });

    expect(actual.embeds).toEqual([
      {
        code: "UNREFERENCED_SOURCE",
        paths: { sources: [], destination: toPath(paths.destinations.l) },
        unreferencedSources: [toPath(paths.sources.a)],
      },
    ]);
  });

  it("returns empty embeds when no sources found", async () => {
    const actual = await embed({ sourcesGlob, cwd, write: false });

    expect(actual.embeds).toEqual([]);
  });

  it("ignores source files without source marker prefix", async () => {
    // Create a source file without the SOURCE_MARKER_PREFIX prefix
    await write(paths.sources.a, sourceACode);

    const actual = await embed({ sourcesGlob, cwd, write: false });

    expect(actual.embeds).toEqual([]);
    expect(actual.sources).toEqual([]);
    expect(actual.destinations).toEqual([]);
  });

  it("throws for non-existent destinations", async () => {
    await write(paths.sources.a, [
      `${SOURCE_MARKER_PREFIX}${paths.destinations.l}`,
      ...sourceACode,
    ]);

    await expect(async () => await embed({ sourcesGlob, cwd, write: false })).rejects.toThrow(
      `ENOENT: no such file or directory, open '${path.join(cwd, paths.destinations.l)}'`,
    );
  });

  it("returns UNREFERENCED_SOURCE for destinations with no embedex tags", async () => {
    await Promise.all([
      write(paths.sources.a, [`${SOURCE_MARKER_PREFIX}${paths.destinations.l}`, ...sourceACode]),
      write(paths.destinations.l, ["/**", " * @example", " * ```ts", " * ```", " */"]),
    ]);

    const actual = await embed({ sourcesGlob, cwd, write: false });

    expect(actual.embeds).toEqual([
      {
        code: "UNREFERENCED_SOURCE",
        paths: { sources: [], destination: toPath(paths.destinations.l) },
        unreferencedSources: [toPath(paths.sources.a)],
      },
    ]);
  });

  it("returns UPDATE for TypeScript destinations with matches", async () => {
    await Promise.all([
      write(paths.sources.a, [`${SOURCE_MARKER_PREFIX}${paths.destinations.l}`, ...sourceACode]),
      write(paths.destinations.l, [
        "/**",
        " * @example",
        ` * <embedex source="${paths.sources.a}">`,
        " * </embedex>",
        " */",
      ]),
    ]);

    const actual = await embed({ sourcesGlob, cwd, write: false });

    expect(actual.embeds).toEqual([
      {
        code: "UPDATE",
        paths: {
          sources: [toPath(paths.sources.a)],
          destination: toPath(paths.destinations.l),
        },
        updatedContent: [
          "/**",
          " * @example",
          ` * <embedex source="${paths.sources.a}">`,
          ...destinationACode,
          " * </embedex>",
          " */",
        ].join("\n"),
      },
    ]);
  });

  it("returns UPDATE for Markdown destinations with matches", async () => {
    await Promise.all([
      write(paths.sources.a, [`${SOURCE_MARKER_PREFIX}${paths.destinations.n}`, ...sourceACode]),
      write(paths.destinations.n, [`<embedex source="${paths.sources.a}">`, "</embedex>"]),
    ]);

    const actual = await embed({ sourcesGlob, cwd, write: false });

    expect(actual.embeds).toEqual([
      {
        code: "UPDATE",
        paths: {
          sources: [toPath(paths.sources.a)],
          destination: toPath(paths.destinations.n),
        },
        updatedContent: [
          `<embedex source="${paths.sources.a}">`,
          "",
          "```ts",
          ...sourceACode,
          "```",
          "",
          "</embedex>",
        ].join("\n"),
      },
    ]);
  });

  it("returns UPDATE for multiple destinations with matches", async () => {
    const destinationContent = [
      "/**",
      " * @example",
      ` * <embedex source="${paths.sources.a}">`,
      " * </embedex>",
      " */",
    ];
    await Promise.all([
      write(paths.sources.a, [
        `${SOURCE_MARKER_PREFIX}${paths.destinations.l},${paths.destinations.m}`,
        ...sourceACode,
      ]),
      write(paths.destinations.l, destinationContent),
      write(paths.destinations.m, destinationContent),
    ]);

    const actual = await embed({ sourcesGlob, cwd, write: false });

    expect(actual.embeds).toEqual([
      {
        code: "UPDATE",
        paths: {
          sources: [toPath(paths.sources.a)],
          destination: toPath(paths.destinations.l),
        },
        updatedContent: expect.any(String),
      },
      {
        code: "UPDATE",
        paths: {
          sources: [toPath(paths.sources.a)],
          destination: toPath(paths.destinations.m),
        },
        updatedContent: expect.any(String),
      },
    ]);
  });

  it("returns UPDATE for multiple destinations with Markdown source", async () => {
    const sourceCode = ["# Hello"];
    await Promise.all([
      write(paths.sources.c, [
        `${SOURCE_MARKER_PREFIX}${paths.destinations.l},${paths.destinations.n}`,
        ...sourceCode,
      ]),
      write(paths.destinations.l, [`<embedex source="${paths.sources.c}">`, "</embedex>"]),
      write(paths.destinations.n, [`<embedex source="${paths.sources.c}">`, "</embedex>"]),
    ]);

    const actual = await embed({ sourcesGlob, cwd, write: false });

    expect(actual.embeds).toEqual([
      {
        code: "UPDATE",
        paths: {
          sources: [toPath(paths.sources.c)],
          destination: toPath(paths.destinations.l),
        },
        updatedContent: [
          `<embedex source="${paths.sources.c}">`,
          "",
          ...sourceCode,
          "",
          "</embedex>",
        ].join("\n"),
      },
      {
        code: "UPDATE",
        paths: {
          sources: [toPath(paths.sources.c)],
          destination: toPath(paths.destinations.n),
        },
        updatedContent: [
          `<embedex source="${paths.sources.c}">`,
          "",
          ...sourceCode,
          "",
          "</embedex>",
        ].join("\n"),
      },
    ]);
  });

  it("returns UPDATE for unknown source with matches", async () => {
    const sourceCode = ["val x = 1;"];
    const sourcePath = "sources/o.unknown";
    await Promise.all([
      write(sourcePath, [`${SOURCE_MARKER_PREFIX}${paths.destinations.l}`, ...sourceCode]),
      write(paths.destinations.l, [`<embedex source="${sourcePath}">`, "</embedex>"]),
    ]);

    const actual = await embed({ sourcesGlob: "sources/**/*.unknown", cwd, write: false });

    expect(actual.embeds).toEqual([
      {
        code: "UPDATE",
        paths: {
          sources: [toPath(sourcePath)],
          destination: toPath(paths.destinations.l),
        },
        updatedContent: [
          `<embedex source="${sourcePath}">`,
          "",
          "```",
          ...sourceCode,
          "```",
          "",
          "</embedex>",
        ].join("\n"),
      },
    ]);
  });

  it("returns UPDATE for destinations with indented matches", async () => {
    const sourceCode = ["function foo() {", `  console.log("bar");`, "}"];
    const destinationCode = ["   * function foo() {", `   *   console.log("bar");`, "   * }"];
    await Promise.all([
      write(paths.sources.a, [`${SOURCE_MARKER_PREFIX}${paths.destinations.l}`, ...sourceCode]),
      write(paths.destinations.l, [
        "class A {",
        "  /**",
        "   * @example",
        `   * <embedex source="${paths.sources.a}">`,
        "   * </embedex>",
        "   */",
        "}",
      ]),
    ]);

    const actual = await embed({ sourcesGlob, cwd, write: false });

    expect(actual.embeds).toEqual([
      {
        code: "UPDATE",
        paths: {
          sources: [toPath(paths.sources.a)],
          destination: toPath(paths.destinations.l),
        },
        updatedContent: [
          "class A {",
          "  /**",
          "   * @example",
          `   * <embedex source="${paths.sources.a}">`,
          "   *",
          "   * ```ts",
          ...destinationCode,
          "   * ```",
          "   *",
          "   * </embedex>",
          "   */",
          "}",
        ].join("\n"),
      },
    ]);
  });

  it("escapes sources with code fences and comment blocks", async () => {
    const sourceCode = ["/** hello */", "```ts", "const x = 1;", "```"];
    const destinationCode = [String.raw` * /** hello *\/`, " * ```ts", " * const x = 1;", " * ```"];
    await Promise.all([
      write(paths.sources.a, [`${SOURCE_MARKER_PREFIX}${paths.destinations.l}`, ...sourceCode]),
      write(paths.destinations.l, [
        "/**",
        " * @example",
        ` * <embedex source="${paths.sources.a}">`,
        " * </embedex>",
        " */",
      ]),
    ]);

    const actual = await embed({ sourcesGlob, cwd, write: false });

    expect(actual.embeds).toEqual([
      {
        code: "UPDATE",
        paths: {
          sources: [toPath(paths.sources.a)],
          destination: toPath(paths.destinations.l),
        },
        updatedContent: [
          "/**",
          " * @example",
          ` * <embedex source="${paths.sources.a}">`,
          " *",
          " * ````ts",
          ...destinationCode,
          " * ````",
          " *",
          " * </embedex>",
          " */",
        ].join("\n"),
      },
    ]);
  });

  it("does not escape comment blocks when embedding into markdown", async () => {
    const sourceCode = ["/** hello */", "const x = 1;"];
    await Promise.all([
      write(paths.sources.a, [`${SOURCE_MARKER_PREFIX}${paths.destinations.n}`, ...sourceCode]),
      write(paths.destinations.n, [`<embedex source="${paths.sources.a}">`, "</embedex>"]),
    ]);

    const actual = await embed({ sourcesGlob, cwd, write: false });

    expect(actual.embeds).toEqual([
      {
        code: "UPDATE",
        paths: {
          sources: [toPath(paths.sources.a)],
          destination: toPath(paths.destinations.n),
        },
        updatedContent: [
          `<embedex source="${paths.sources.a}">`,
          "",
          "```ts",
          ...sourceCode,
          "```",
          "",
          "</embedex>",
        ].join("\n"),
      },
    ]);
  });

  it("returns UPDATE for destinations with multiple matches", async () => {
    await Promise.all([
      write(paths.sources.a, [`${SOURCE_MARKER_PREFIX}${paths.destinations.l}`, ...sourceACode]),
      write(paths.destinations.l, [
        "/**",
        " * @example",
        ` * <embedex source="${paths.sources.a}">`,
        " * </embedex>",
        " * @example",
        ` * <embedex source="${paths.sources.a}">`,
        " * </embedex>",
        " */",
      ]),
    ]);

    const actual = await embed({ sourcesGlob, cwd, write: false });

    expect(actual.embeds).toEqual([
      {
        code: "UPDATE",
        paths: {
          sources: [toPath(paths.sources.a)],
          destination: toPath(paths.destinations.l),
        },
        updatedContent: expect.any(String),
      },
    ]);
  });

  it("does not write destination if `write` is false", async () => {
    const destinationContent = [
      "/**",
      " * @example",
      ` * <embedex source="${paths.sources.a}">`,
      " * </embedex>",
      " */",
    ];
    await Promise.all([
      write(paths.sources.a, [`${SOURCE_MARKER_PREFIX}${paths.destinations.l}`, ...sourceACode]),
      write(paths.destinations.l, destinationContent),
    ]);

    await embed({ sourcesGlob, cwd, write: false });
    const actual = await read(paths.destinations.l);

    expect(actual).toEqual(destinationContent.join("\n"));
  });

  it("returns NO_CHANGE if already embedded", async () => {
    await Promise.all([
      write(paths.sources.a, [`${SOURCE_MARKER_PREFIX}${paths.destinations.l}`, ...sourceACode]),
      write(paths.destinations.l, [
        "/**",
        " * @example",
        ` * <embedex source="${paths.sources.a}">`,
        ...destinationACode,
        " * </embedex>",
        " */",
      ]),
    ]);

    const actual = await embed({ sourcesGlob, cwd, write: true });

    expect(actual.embeds).toEqual([
      {
        code: "NO_CHANGE",
        paths: { sources: [toPath(paths.sources.a)], destination: toPath(paths.destinations.l) },
      },
    ]);
  });

  it("writes source to destination", async () => {
    await Promise.all([
      write(paths.sources.a, [`${SOURCE_MARKER_PREFIX}${paths.destinations.l}`, ...sourceACode]),
      write(paths.destinations.l, [
        "/**",
        " * @example",
        ` * <embedex source="${paths.sources.a}">`,
        " * </embedex>",
        " */",
      ]),
    ]);

    await embed({ sourcesGlob, cwd, write: true });
    const actual = await read(paths.destinations.l);

    expect(actual).toEqual(
      [
        "/**",
        " * @example",
        ` * <embedex source="${paths.sources.a}">`,
        ...destinationACode,
        " * </embedex>",
        " */",
      ].join("\n"),
    );
  });

  it("writes multiple sources to destination", async () => {
    const sourceBCode = [`const x = "b";`];
    const destinationBCode = [" *", " * ```ts", ` * const x = "b";`, " * ```", " *"];
    await Promise.all([
      write(paths.sources.a, [`${SOURCE_MARKER_PREFIX}${paths.destinations.l}`, ...sourceACode]),
      write(paths.sources.b, [`${SOURCE_MARKER_PREFIX}${paths.destinations.l}`, ...sourceBCode]),
      write(paths.destinations.l, [
        "/**",
        " * @example",
        ` * <embedex source="${paths.sources.a}">`,
        " * </embedex>",
        " * @example",
        " * ```ts",
        ` * const x = "shouldNotBeUpdated";`,
        " * ```",
        " * @example",
        ` * <embedex source="${paths.sources.b}">`,
        " * </embedex>",
        " */",
      ]),
    ]);

    await embed({ sourcesGlob, cwd, write: true });
    const actual = await read(paths.destinations.l);

    expect(actual).toEqual(
      [
        "/**",
        " * @example",
        ` * <embedex source="${paths.sources.a}">`,
        ...destinationACode,
        " * </embedex>",
        " * @example",
        " * ```ts",
        ` * const x = "shouldNotBeUpdated";`,
        " * ```",
        " * @example",
        ` * <embedex source="${paths.sources.b}">`,
        ...destinationBCode,
        " * </embedex>",
        " */",
      ].join("\n"),
    );
  });

  describe("dependency graph and chained embeds", () => {
    it("processes simple chain A -> B -> C in single run", async () => {
      // A.ts embeds into B.md, B.md embeds into C.md
      // Should work in a single run now
      const chainPaths = {
        a: "sources/a.ts",
        b: "sources/b.md",
        c: "src/c.md",
      };

      await Promise.all([
        write(chainPaths.a, [`${SOURCE_MARKER_PREFIX}${chainPaths.b}`, ...sourceACode]),
        write(chainPaths.b, [
          `${SOURCE_MARKER_PREFIX}${chainPaths.c}`,
          `<embedex source="${chainPaths.a}">`,
          "</embedex>",
        ]),
        write(chainPaths.c, [`<embedex source="${chainPaths.b}">`, "</embedex>"]),
      ]);

      const actual = await embed({ sourcesGlob, cwd, write: false });

      // B.md should have A.ts embedded
      const embedB = actual.embeds.find(
        (embed) => embed.paths.destination === toPath(chainPaths.b),
      );
      expect(embedB?.code).toBe("UPDATE");

      // C.md should have updated B.md content (with A.ts embedded)
      const embedC = actual.embeds.find(
        (embed) => embed.paths.destination === toPath(chainPaths.c),
      );
      expect(embedC).toBeDefined();
      assertIsUpdatedEmbed(embedC!);
      // Verify that C.md contains the code from A.ts
      expect(embedC.updatedContent).toContain(sourceACode[0]);
    });

    it("processes 4-level chain correctly", async () => {
      const paths4 = {
        a: "sources/a.ts",
        b: "sources/b.md",
        c: "sources/c.md",
        d: "src/d.md",
      };

      await Promise.all([
        write(paths4.a, [`${SOURCE_MARKER_PREFIX}${paths4.b}`, "const x = 1;"]),
        write(paths4.b, [
          `${SOURCE_MARKER_PREFIX}${paths4.c}`,
          `<embedex source="${paths4.a}">`,
          "</embedex>",
        ]),
        write(paths4.c, [
          `${SOURCE_MARKER_PREFIX}${paths4.d}`,
          `<embedex source="${paths4.b}">`,
          "</embedex>",
        ]),
        write(paths4.d, [`<embedex source="${paths4.c}">`, "</embedex>"]),
      ]);

      const actual = await embed({ sourcesGlob: "sources/**/*.{md,ts}", cwd, write: false });

      // All should be UPDATE
      expect(actual.embeds.every((embed) => embed.code === "UPDATE")).toBe(true);

      // Final destination should contain original source code
      const embedD = actual.embeds.find((embed) => embed.paths.destination === toPath(paths4.d));
      expect(embedD).toBeDefined();
      assertIsUpdatedEmbed(embedD!);
      expect(embedD.updatedContent).toContain("const x = 1;");
    });

    it("processes diamond dependency correctly", async () => {
      // A -> B, A -> C, both embed into D
      const pathsDiamond = {
        a: "sources/a.ts",
        b: "sources/b.md",
        c: "sources/c.md",
        d: "src/d.md",
      };

      await Promise.all([
        write(pathsDiamond.a, [
          `${SOURCE_MARKER_PREFIX}${pathsDiamond.b},${pathsDiamond.c}`,
          "const x = 1;",
        ]),
        write(pathsDiamond.b, [
          `${SOURCE_MARKER_PREFIX}${pathsDiamond.d}`,
          `<embedex source="${pathsDiamond.a}">`,
          "</embedex>",
        ]),
        write(pathsDiamond.c, [
          `${SOURCE_MARKER_PREFIX}${pathsDiamond.d}`,
          `<embedex source="${pathsDiamond.a}">`,
          "</embedex>",
        ]),
        write(pathsDiamond.d, [
          `<embedex source="${pathsDiamond.b}">`,
          "</embedex>",
          "",
          `<embedex source="${pathsDiamond.c}">`,
          "</embedex>",
        ]),
      ]);

      const actual = await embed({ sourcesGlob: "sources/**/*.{md,ts}", cwd, write: false });

      // All should be UPDATE
      expect(actual.embeds.every((embed) => embed.code === "UPDATE")).toBe(true);

      // Final destination should contain embedded content from both B and C
      const embedD = actual.embeds.find(
        (embed) => embed.paths.destination === toPath(pathsDiamond.d),
      );
      expect(embedD).toBeDefined();
      assertIsUpdatedEmbed(embedD!);
      expect(embedD.updatedContent).toContain("const x = 1;");
    });

    it("detects circular dependency A -> B -> A", async () => {
      const cyclePaths = {
        a: "sources/a.md",
        b: "sources/b.md",
      };

      await Promise.all([
        write(cyclePaths.a, [
          `${SOURCE_MARKER_PREFIX}${cyclePaths.b}`,
          `<embedex source="${cyclePaths.b}">`,
          "</embedex>",
        ]),
        write(cyclePaths.b, [
          `${SOURCE_MARKER_PREFIX}${cyclePaths.a}`,
          `<embedex source="${cyclePaths.a}">`,
          "</embedex>",
        ]),
      ]);

      const actual = await embed({ sourcesGlob, cwd, write: false });

      expect(actual.embeds).toHaveLength(1);
      const firstEmbed = actual.embeds[0];
      expect(firstEmbed).toBeDefined();
      assertIsCircularDependencyEmbed(firstEmbed!);
      expect(firstEmbed.cycle.length).toBeGreaterThanOrEqual(3);
      // Cycle should contain both files
      const cycleSet = new Set(firstEmbed.cycle);
      expect(cycleSet.has(toPath(cyclePaths.a))).toBe(true);
      expect(cycleSet.has(toPath(cyclePaths.b))).toBe(true);
    });

    it("detects 3-node circular dependency A -> B -> C -> A", async () => {
      const pathsCycle = {
        a: "sources/a.md",
        b: "sources/b.md",
        c: "sources/c.md",
      };

      await Promise.all([
        write(pathsCycle.a, [
          `${SOURCE_MARKER_PREFIX}${pathsCycle.b}`,
          `<embedex source="${pathsCycle.c}">`,
          "</embedex>",
        ]),
        write(pathsCycle.b, [
          `${SOURCE_MARKER_PREFIX}${pathsCycle.c}`,
          `<embedex source="${pathsCycle.a}">`,
          "</embedex>",
        ]),
        write(pathsCycle.c, [
          `${SOURCE_MARKER_PREFIX}${pathsCycle.a}`,
          `<embedex source="${pathsCycle.b}">`,
          "</embedex>",
        ]),
      ]);

      const actual = await embed({ sourcesGlob, cwd, write: false });

      expect(actual.embeds).toHaveLength(1);
      const cycleEmbed = actual.embeds[0];
      expect(cycleEmbed).toBeDefined();
      assertIsCircularDependencyEmbed(cycleEmbed!);
      expect(cycleEmbed.cycle.length).toBeGreaterThanOrEqual(3);
    });

    it("processes multiple independent chains correctly", async () => {
      const pathsMulti = {
        a1: "sources/a1.ts",
        b1: "sources/b1.md",
        a2: "sources/a2.ts",
        b2: "sources/b2.md",
      };

      await Promise.all([
        write(pathsMulti.a1, [`${SOURCE_MARKER_PREFIX}${pathsMulti.b1}`, "const x = 1;"]),
        write(pathsMulti.b1, [`<embedex source="${pathsMulti.a1}">`, "</embedex>"]),
        write(pathsMulti.a2, [`${SOURCE_MARKER_PREFIX}${pathsMulti.b2}`, "const y = 2;"]),
        write(pathsMulti.b2, [`<embedex source="${pathsMulti.a2}">`, "</embedex>"]),
      ]);

      const actual = await embed({ sourcesGlob, cwd, write: false });

      expect(actual.embeds).toHaveLength(2);
      expect(actual.embeds.every((embed) => embed.code === "UPDATE")).toBe(true);
    });
  });

  describe("nested embedex tags", () => {
    it("strips nested embedex tags from markdown and removes leading/trailing blank lines", async () => {
      const intermediateMarkdown = "sources/intermediate.md";
      const finalMarkdown = "src/final.md";

      // Create a TypeScript source
      await write(paths.sources.a, [
        `${SOURCE_MARKER_PREFIX}${intermediateMarkdown}`,
        ...sourceACode,
      ]);

      // Create an intermediate markdown that embeds the TypeScript source
      await write(intermediateMarkdown, [
        `${SOURCE_MARKER_PREFIX}${finalMarkdown}`,
        "",
        "1. Step one:",
        "",
        `   <embedex source="${paths.sources.a}">`,
        "",
        "   ```ts",
        ...sourceACode.map((line) => `   ${line}`),
        "   ```",
        "",
        "   </embedex>",
      ]);

      // Create final markdown that embeds the intermediate markdown
      await write(finalMarkdown, [`<embedex source="${intermediateMarkdown}">`, "</embedex>"]);

      const actual = await embed({ sourcesGlob, cwd, write: false });

      // Find the final markdown embed (order of processing may vary)
      const finalEmbed = actual.embeds.find(
        (embed) => embed.paths.destination === toPath(finalMarkdown),
      );
      const intermediateEmbed = actual.embeds.find(
        (embed) => embed.paths.destination === toPath(intermediateMarkdown),
      );

      // The intermediate markdown should embed the TypeScript source
      expect(intermediateEmbed).toEqual({
        code: "UPDATE",
        paths: {
          sources: [toPath(paths.sources.a)],
          destination: toPath(intermediateMarkdown),
        },
        updatedContent: expect.any(String),
      });

      // The final markdown should have the intermediate content with nested tags stripped
      expect(finalEmbed).toEqual({
        code: "UPDATE",
        paths: {
          sources: [toPath(intermediateMarkdown)],
          destination: toPath(finalMarkdown),
        },
        updatedContent: [
          `<embedex source="${intermediateMarkdown}">`,
          "",
          "1. Step one:",
          "",
          "   ```ts",
          '   const x = "a";',
          "",
          // eslint-disable-next-line no-template-curly-in-string
          "   console.log(`Got ${x}`);",
          "   ```",
          "",
          "</embedex>",
        ].join("\n"),
      });
    });

    it("removes multiple levels of nested embedex tags with blank lines", async () => {
      const level1 = "sources/level1.md";
      const level2 = "sources/level2.md";
      const final = "src/final.md";

      // Level 1: Raw content
      await write(level1, [`${SOURCE_MARKER_PREFIX}${level2}`, "Hello world"]);

      // Level 2: Embeds level 1 with extra blank lines
      await write(level2, [
        `${SOURCE_MARKER_PREFIX}${final}`,
        "",
        `<embedex source="${level1}">`,
        "",
        "",
        "Hello world",
        "",
        "",
        "</embedex>",
      ]);

      // Final: Embeds level 2
      await write(final, [`<embedex source="${level2}">`, "</embedex>"]);

      const actual = await embed({ sourcesGlob, cwd, write: false });

      const finalEmbed = actual.embeds.find((embed) => embed.paths.destination === toPath(final));
      expect(finalEmbed).toEqual({
        code: "UPDATE",
        paths: {
          sources: [toPath(level2)],
          destination: toPath(final),
        },
        updatedContent: [`<embedex source="${level2}">`, "", "Hello world", "", "</embedex>"].join(
          "\n",
        ),
      });
    });

    it("preserves intentional blank lines within content while removing extras", async () => {
      const intermediate = "sources/intermediate.md";
      const final = "src/final.md";

      // Create intermediate with intentional blank lines in content
      await write(intermediate, [
        `${SOURCE_MARKER_PREFIX}${final}`,
        "",
        "Line 1",
        "",
        "Line 2",
        "",
        `<embedex source="${paths.sources.a}">`,
        "",
        "```ts",
        ...sourceACode,
        "```",
        "",
        "</embedex>",
      ]);

      await write(paths.sources.a, [`${SOURCE_MARKER_PREFIX}${intermediate}`, ...sourceACode]);
      await write(final, [`<embedex source="${intermediate}">`, "</embedex>"]);

      const actual = await embed({ sourcesGlob, cwd, write: false });

      const finalEmbed = actual.embeds.find((embed) => embed.paths.destination === toPath(final));
      expect(finalEmbed).toEqual({
        code: "UPDATE",
        paths: {
          sources: [toPath(intermediate)],
          destination: toPath(final),
        },
        updatedContent: [
          `<embedex source="${intermediate}">`,
          "",
          "Line 1",
          "",
          "Line 2",
          "",
          "```ts",
          ...sourceACode,
          "```",
          "",
          "</embedex>",
        ].join("\n"),
      });
    });
  });

  it("handles embedex tags with no newline between opening and closing tags", async () => {
    await Promise.all([
      write(paths.sources.a, [`${SOURCE_MARKER_PREFIX}${paths.destinations.n}`, ...sourceACode]),
      write(paths.destinations.n, [`<embedex source="${paths.sources.a}"></embedex>`]),
    ]);

    const actual = await embed({ sourcesGlob, cwd, write: false });

    expect(actual.embeds).toEqual([
      {
        code: "UPDATE",
        paths: {
          sources: [toPath(paths.sources.a)],
          destination: toPath(paths.destinations.n),
        },
        updatedContent: [
          `<embedex source="${paths.sources.a}">`,
          "",
          "```ts",
          ...sourceACode,
          "```",
          "",
          "</embedex>",
        ].join("\n"),
      },
    ]);
  });

  describe("CRLF line endings", () => {
    it("handles Windows-style CRLF line endings correctly", async () => {
      const sourceCode = [`const x = "windows";`, "", "console.log(x);"];

      // Write files with CRLF line endings
      await Promise.all([
        writeWithCrlf(paths.sources.a, [
          `${SOURCE_MARKER_PREFIX}${paths.destinations.l}`,
          ...sourceCode,
        ]),
        writeWithCrlf(paths.destinations.l, [
          "/**",
          " * @example",
          ` * <embedex source="${paths.sources.a}">`,
          " * </embedex>",
          " */",
        ]),
      ]);

      const actual = await embed({ sourcesGlob, cwd, write: false });

      expect(actual.embeds).toHaveLength(1);
      const embedResult = actual.embeds[0]!;
      assertIsUpdatedEmbed(embedResult);
      expect(embedResult.paths).toEqual({
        sources: [toPath(paths.sources.a)],
        destination: toPath(paths.destinations.l),
      });

      // Verify the updated content
      const { updatedContent } = embedResult;
      // Ensure no trailing \r characters are present
      expect(updatedContent).not.toContain("\r");
      // Verify the content structure
      expect(updatedContent).toContain(`<embedex source="${paths.sources.a}">`);
      expect(updatedContent).toContain('const x = "windows";');
      expect(updatedContent).toContain("console.log(x);");
    });

    it("handles mixed LF and CRLF line endings", async () => {
      // Source has LF, destination has CRLF
      await Promise.all([
        write(paths.sources.a, [`${SOURCE_MARKER_PREFIX}${paths.destinations.l}`, "const x = 1;"]),
        writeWithCrlf(paths.destinations.l, [
          "/**",
          " * @example",
          ` * <embedex source="${paths.sources.a}">`,
          " * </embedex>",
          " */",
        ]),
      ]);

      const actual = await embed({ sourcesGlob, cwd, write: false });

      expect(actual.embeds).toHaveLength(1);
      const embedResult = actual.embeds[0]!;
      assertIsUpdatedEmbed(embedResult);
      expect(embedResult.paths).toEqual({
        sources: [toPath(paths.sources.a)],
        destination: toPath(paths.destinations.l),
      });

      const { updatedContent } = embedResult;
      expect(updatedContent).not.toContain("\r");
      expect(updatedContent).toContain("const x = 1;");
    });
  });
});

function assertIsUpdatedEmbed(embed: Embed): asserts embed is Updated {
  expect(embed.code).toBe("UPDATE");
}

function assertIsCircularDependencyEmbed(embed: Embed): asserts embed is CircularDependency {
  expect(embed.code).toBe("CIRCULAR_DEPENDENCY");
}
