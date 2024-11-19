import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { embed } from "./embed";

describe("embed", () => {
  // eslint-disable-next-line no-template-curly-in-string
  const exampleACode = [`const x = "a";`, "", "console.log(`Got ${x}`);"];
  // eslint-disable-next-line no-template-curly-in-string
  const targetACode = [` * const x = "a";`, " *", " * console.log(`Got ${x}`);"];
  const globPattern = "examples/**/*.ts";
  let cwd: string;
  let paths: {
    examples: Record<"a" | "b", string>;
    targets: Record<"l" | "m", string>;
  };

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "embedex"));
    paths = {
      examples: { a: "examples/a.ts", b: "examples/b.ts" },
      targets: { l: "src/l.ts", m: "src/m.ts" },
    };
    await Promise.all([mkdir(join(cwd, "examples")), mkdir(join(cwd, "src"))]);
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

  it("returns NO_MATCH for non-existent examples", async () => {
    await Promise.all([
      write(paths.examples.a, [`// ${paths.targets.l}`, ...exampleACode]),
      write(paths.targets.l, [
        "/**",
        " * @example",
        " * ```ts",
        ` * // ${paths.examples.b}`,
        " * ```",
        " */",
      ]),
    ]);

    const actual = await embed({ examplesGlob: globPattern, cwd, write: false });

    expect(actual.embeds).toEqual([
      { code: "NO_MATCH", paths: { examples: [], target: toPath(paths.targets.l) } },
    ]);
  });

  it("returns empty embeds when no examples found", async () => {
    const actual = await embed({ examplesGlob: globPattern, cwd, write: false });

    expect(actual.embeds).toEqual([]);
  });

  it("throws for non-existent targets", async () => {
    await write(paths.examples.a, [`// ${paths.targets.l}`, ...exampleACode]);

    await expect(
      async () => await embed({ examplesGlob: globPattern, cwd, write: false }),
    ).rejects.toThrow(`ENOENT: no such file or directory, open '${join(cwd, paths.targets.l)}'`);
  });

  it("returns NO_MATCH for targets with no matches", async () => {
    await Promise.all([
      write(paths.examples.a, [`// ${paths.targets.l}`, ...exampleACode]),
      write(paths.targets.l, ["/**", " * @example", " * ```ts", " * ```", " */"]),
    ]);

    const actual = await embed({ examplesGlob: globPattern, cwd, write: false });

    expect(actual.embeds).toEqual([
      {
        code: "NO_MATCH",
        paths: { examples: [], target: toPath(paths.targets.l) },
      },
    ]);
  });

  it("returns UPDATE for targets with matches", async () => {
    await Promise.all([
      write(paths.examples.a, [`// ${paths.targets.l}`, ...exampleACode]),
      write(paths.targets.l, [
        "/**",
        " * @example",
        " * ```ts",
        ` * // ${paths.examples.a}`,
        " * ```",
        " */",
      ]),
    ]);

    const actual = await embed({ examplesGlob: globPattern, cwd, write: false });

    expect(actual.embeds).toEqual([
      {
        code: "UPDATE",
        paths: {
          examples: [toPath(paths.examples.a)],
          target: toPath(paths.targets.l),
        },
        updatedContent: [
          "/**",
          " * @example",
          " * ```ts",
          ` * // ${paths.examples.a}`,
          ...targetACode,
          " * ```",
          " */",
        ].join("\n"),
      },
    ]);
  });

  it("returns UPDATE for multiple targets with matches", async () => {
    const targetContent = [
      "/**",
      " * @example",
      " * ```ts",
      ` * // ${paths.examples.a}`,
      " * ```",
      " */",
    ];
    await Promise.all([
      write(paths.examples.a, [`// ${paths.targets.l},${paths.targets.m}`, ...exampleACode]),
      write(paths.targets.l, targetContent),
      write(paths.targets.m, targetContent),
    ]);

    const actual = await embed({ examplesGlob: globPattern, cwd, write: false });

    expect(actual.embeds).toEqual([
      {
        code: "UPDATE",
        paths: {
          examples: [toPath(paths.examples.a)],
          target: toPath(paths.targets.l),
        },
        updatedContent: expect.any(String),
      },
      {
        code: "UPDATE",
        paths: {
          examples: [toPath(paths.examples.a)],
          target: toPath(paths.targets.m),
        },
        updatedContent: expect.any(String),
      },
    ]);
  });

  it("returns UPDATE for targets with indented matches", async () => {
    const exampleCode = ["function foo() {", `  console.log("bar");`, "}"];
    const targetCode = ["   * function foo() {", `   *   console.log("bar");`, "   * }"];
    await Promise.all([
      write(paths.examples.a, [`// ${paths.targets.l}`, ...exampleCode]),
      write(paths.targets.l, [
        "class A {",
        "  /**",
        "   * @example",
        "   * ```ts",
        `   * // ${paths.examples.a}`,
        "   * ```",
        "   */",
        "}",
      ]),
    ]);

    const actual = await embed({ examplesGlob: globPattern, cwd, write: false });

    expect(actual.embeds).toEqual([
      {
        code: "UPDATE",
        paths: {
          examples: [toPath(paths.examples.a)],
          target: toPath(paths.targets.l),
        },
        updatedContent: [
          "class A {",
          "  /**",
          "   * @example",
          "   * ```ts",
          `   * // ${paths.examples.a}`,
          ...targetCode,
          "   * ```",
          "   */",
          "}",
        ].join("\n"),
      },
    ]);
  });

  it("escapes examples with code and comment blocks", async () => {
    const exampleCode = ["/** hello */", "```ts", "const x = 1;", "```"];
    const targetCode = [" * /** hello *\\/", " * ```ts", " * const x = 1;", " * ```"];
    await Promise.all([
      write(paths.examples.a, [`// ${paths.targets.l}`, ...exampleCode]),
      write(paths.targets.l, [
        "/**",
        " * @example",
        " * ```ts",
        ` * // ${paths.examples.a}`,
        " * ```",
        " */",
      ]),
    ]);

    const actual = await embed({ examplesGlob: globPattern, cwd, write: false });

    expect(actual.embeds).toEqual([
      {
        code: "UPDATE",
        paths: {
          examples: [toPath(paths.examples.a)],
          target: toPath(paths.targets.l),
        },
        updatedContent: [
          "/**",
          " * @example",
          " * ````ts",
          ` * // ${paths.examples.a}`,
          ...targetCode,
          " * ````",
          " */",
        ].join("\n"),
      },
    ]);
  });

  it("returns UPDATE for targets with multiple matches", async () => {
    await write(paths.examples.a, [`// ${paths.targets.l}`, ...exampleACode]);
    await write(paths.targets.l, [
      "/**",
      " * @example",
      " * ```ts",
      ` * // ${paths.examples.a}`,
      " * ```",
      " * @example",
      " * ```ts",
      ` * // ${paths.examples.a}`,
      " * ```",
      " */",
    ]);

    const actual = await embed({ examplesGlob: globPattern, cwd, write: false });

    expect(actual.embeds).toEqual([
      {
        code: "UPDATE",
        paths: {
          examples: [toPath(paths.examples.a), toPath(paths.examples.a)],
          target: toPath(paths.targets.l),
        },
        updatedContent: expect.any(String),
      },
    ]);
  });

  it("does not write target if `write` is false", async () => {
    const targetContent = [
      "/**",
      " * @example",
      " * ```ts",
      ` * // ${paths.examples.a}`,
      " * ```",
      " */",
    ];
    await write(paths.examples.a, [`// ${paths.targets.l}`, ...exampleACode]);
    await write(paths.targets.l, targetContent);

    await embed({ examplesGlob: globPattern, cwd, write: false });
    const actual = await read(paths.targets.l);

    expect(actual).toEqual(targetContent.join("\n"));
  });

  it("returns NO_CHANGE if already embedded", async () => {
    await write(paths.examples.a, [`// ${paths.targets.l}`, ...exampleACode]);
    await write(paths.targets.l, [
      "/**",
      " * @example",
      " * ```ts",
      ` * // ${paths.examples.a}`,
      ...targetACode,
      " * ```",
      " */",
    ]);

    const actual = await embed({ examplesGlob: globPattern, cwd, write: true });

    expect(actual.embeds).toEqual([
      {
        code: "NO_CHANGE",
        paths: { examples: [toPath(paths.examples.a)], target: toPath(paths.targets.l) },
      },
    ]);
  });

  it("writes example to target", async () => {
    await write(paths.examples.a, [`// ${paths.targets.l}`, ...exampleACode]);
    await write(paths.targets.l, [
      "/**",
      " * @example",
      " * ```ts",
      ` * // ${paths.examples.a}`,
      " * ```",
      " */",
    ]);

    await embed({ examplesGlob: globPattern, cwd, write: true });
    const actual = await read(paths.targets.l);

    expect(actual).toEqual(
      [
        "/**",
        " * @example",
        " * ```ts",
        ` * // ${paths.examples.a}`,
        ...targetACode,
        " * ```",
        " */",
      ].join("\n"),
    );
  });

  it("writes multiple examples to target", async () => {
    const exampleBCode = [`const x = "b";`];
    const targetBCode = [` * const x = "b";`];
    await write(paths.examples.a, [`// ${paths.targets.l}`, ...exampleACode]);
    await write(paths.examples.b, [`// ${paths.targets.l}`, ...exampleBCode]);
    await write(paths.targets.l, [
      "/**",
      " * @example",
      " * ```ts",
      ` * // ${paths.examples.a}`,
      " * ```",
      " * @example",
      " * ```ts",
      ` * // decoy match`,
      ` * const x = "shouldNotBeUpdated";`,
      " * ```",
      " * @example",
      " * ```ts",
      ` * // ${paths.examples.b}`,
      " * ```",
      " */",
    ]);

    await embed({ examplesGlob: globPattern, cwd, write: true });
    const actual = await read(paths.targets.l);

    expect(actual).toEqual(
      [
        "/**",
        " * @example",
        " * ```ts",
        ` * // ${paths.examples.a}`,
        ...targetACode,
        " * ```",
        " * @example",
        " * ```ts",
        ` * // decoy match`,
        ` * const x = "shouldNotBeUpdated";`,
        " * ```",
        " * @example",
        " * ```ts",
        ` * // ${paths.examples.b}`,
        ...targetBCode,
        " * ```",
        " */",
      ].join("\n"),
    );
  });
});
