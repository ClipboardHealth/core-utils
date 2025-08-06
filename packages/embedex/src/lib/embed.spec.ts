import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { embed } from "./embed";

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
    cwd = await mkdtemp(join(tmpdir(), "embedex"));
    paths = {
      sources: { a: "sources/a.ts", b: "sources/b.ts", c: "sources/c.md" },
      destinations: { l: "src/l.ts", m: "src/m.ts", n: "src/n.md" },
    };
    await Promise.all([mkdir(join(cwd, "sources")), mkdir(join(cwd, "src"))]);
  });

  async function read(path: string) {
    return await readFile(join(cwd, path), "utf8");
  }

  async function write(path: string, content: string[]) {
    await writeFile(join(cwd, path), content.join("\n"), "utf8");
  }

  function toPath(path: string) {
    return join(cwd, path);
  }

  it("returns NO_MATCH for non-existent sources", async () => {
    await Promise.all([
      write(paths.sources.a, [`// ${paths.destinations.l}`, ...sourceACode]),
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
      { code: "NO_MATCH", paths: { sources: [], destination: toPath(paths.destinations.l) } },
    ]);
  });

  it("returns empty embeds when no sources found", async () => {
    const actual = await embed({ sourcesGlob, cwd, write: false });

    expect(actual.embeds).toEqual([]);
  });

  it("ignores source files without source marker prefix", async () => {
    // Create a source file without the "// " prefix
    await write(paths.sources.a, sourceACode);

    const actual = await embed({ sourcesGlob, cwd, write: false });

    expect(actual.embeds).toEqual([]);
    expect(actual.sources).toEqual([]);
    expect(actual.destinations).toEqual([]);
  });

  it("throws for non-existent destinations", async () => {
    await write(paths.sources.a, [`// ${paths.destinations.l}`, ...sourceACode]);

    await expect(async () => await embed({ sourcesGlob, cwd, write: false })).rejects.toThrow(
      `ENOENT: no such file or directory, open '${join(cwd, paths.destinations.l)}'`,
    );
  });

  it("returns NO_MATCH for destinations with no matches", async () => {
    await Promise.all([
      write(paths.sources.a, [`// ${paths.destinations.l}`, ...sourceACode]),
      write(paths.destinations.l, ["/**", " * @example", " * ```ts", " * ```", " */"]),
    ]);

    const actual = await embed({ sourcesGlob, cwd, write: false });

    expect(actual.embeds).toEqual([
      {
        code: "NO_MATCH",
        paths: { sources: [], destination: toPath(paths.destinations.l) },
      },
    ]);
  });

  it("returns UPDATE for TypeScript destinations with matches", async () => {
    await Promise.all([
      write(paths.sources.a, [`// ${paths.destinations.l}`, ...sourceACode]),
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
      write(paths.sources.a, [`// ${paths.destinations.n}`, ...sourceACode]),
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
        `// ${paths.destinations.l},${paths.destinations.m}`,
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
      write(paths.sources.c, [`// ${paths.destinations.l},${paths.destinations.n}`, ...sourceCode]),
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
      write(sourcePath, [`// ${paths.destinations.l}`, ...sourceCode]),
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
      write(paths.sources.a, [`// ${paths.destinations.l}`, ...sourceCode]),
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
    const destinationCode = [" * /** hello *\\/", " * ```ts", " * const x = 1;", " * ```"];
    await Promise.all([
      write(paths.sources.a, [`// ${paths.destinations.l}`, ...sourceCode]),
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

  it("returns UPDATE for destinations with multiple matches", async () => {
    await Promise.all([
      write(paths.sources.a, [`// ${paths.destinations.l}`, ...sourceACode]),
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
          sources: [toPath(paths.sources.a), toPath(paths.sources.a)],
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
      write(paths.sources.a, [`// ${paths.destinations.l}`, ...sourceACode]),
      write(paths.destinations.l, destinationContent),
    ]);

    await embed({ sourcesGlob, cwd, write: false });
    const actual = await read(paths.destinations.l);

    expect(actual).toEqual(destinationContent.join("\n"));
  });

  it("returns NO_CHANGE if already embedded", async () => {
    await Promise.all([
      write(paths.sources.a, [`// ${paths.destinations.l}`, ...sourceACode]),
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
      write(paths.sources.a, [`// ${paths.destinations.l}`, ...sourceACode]),
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
      write(paths.sources.a, [`// ${paths.destinations.l}`, ...sourceACode]),
      write(paths.sources.b, [`// ${paths.destinations.l}`, ...sourceBCode]),
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
});
