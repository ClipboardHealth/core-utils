import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { embed } from "./embed";

describe("embed", () => {
  const exampleACode = [`const x = "a";`, "", `console.log(x);`];
  const targetACode = [` * const x = "a";`, " *", ` * console.log(x);`];
  const globPattern = "examples/**/*.ts";
  let root: string;
  let paths: {
    examples: Record<"a" | "b", string>;
    targets: Record<"l" | "m", string>;
  };

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "embedex"));
    paths = {
      examples: { a: "examples/a.ts", b: "examples/b.ts" },
      targets: { l: "src/l.ts", m: "src/m.ts" },
    };
    await Promise.all([mkdir(join(root, "examples")), mkdir(join(root, "src"))]);
  });

  async function read(path: string) {
    return await readFile(join(root, path), "utf8");
  }

  async function write(path: string, content: string[]) {
    await writeFile(join(root, path), content.join("\n"), "utf8");
  }

  function toPath(path: string) {
    return join(root, path);
  }

  it("doesn't match non-existent examples", async () => {
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

    const actual = await embed({ globPattern, root, write: false });

    expect(actual).toEqual([
      { code: "NO_MATCH", paths: { examples: [], target: toPath(paths.targets.l) } },
    ]);
  });

  it("succeeds when no examples found", async () => {
    const actual = await embed({ globPattern, root, write: false });

    expect(actual).toEqual([]);
  });

  it("fails if target does not exist", async () => {
    await write(paths.examples.a, [`// ${paths.targets.l}`, ...exampleACode]);

    await expect(async () => await embed({ globPattern, root, write: false })).rejects.toThrow(
      `ENOENT: no such file or directory, open '${join(root, paths.targets.l)}'`,
    );
  });

  it("fails if target does not match", async () => {
    await Promise.all([
      write(paths.examples.a, [`// ${paths.targets.l}`, ...exampleACode]),
      write(paths.targets.l, ["/**", " * @example", " * ```ts", " * ```", " */"]),
    ]);

    const actual = await embed({ globPattern, root, write: false });

    expect(actual).toEqual([
      {
        code: "NO_MATCH",
        paths: { examples: [], target: toPath(paths.targets.l) },
      },
    ]);
  });

  it("reads example and target", async () => {
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

    const actual = await embed({ globPattern, root, write: false });

    expect(actual).toEqual([
      {
        code: "UPDATED",
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

  it("reads multiple targets", async () => {
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

    const actual = await embed({ globPattern, root, write: false });

    expect(actual).toEqual([
      {
        code: "UPDATED",
        paths: {
          examples: [toPath(paths.examples.a)],
          target: toPath(paths.targets.l),
        },
        updatedContent: expect.any(String),
      },
      {
        code: "UPDATED",
        paths: {
          examples: [toPath(paths.examples.a)],
          target: toPath(paths.targets.m),
        },
        updatedContent: expect.any(String),
      },
    ]);
  });

  it("handles indentation", async () => {
    const targetCode = [`   * const x = "a";`, "   *", `   * console.log(x);`];
    await Promise.all([
      write(paths.examples.a, [`// ${paths.targets.l}`, ...exampleACode]),
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

    const actual = await embed({ globPattern, root, write: false });

    expect(actual).toEqual([
      {
        code: "UPDATED",
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

  it("finds multiple matches in targets", async () => {
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

    const actual = await embed({ globPattern, root, write: false });

    expect(actual).toEqual([
      {
        code: "UPDATED",
        paths: {
          examples: [toPath(paths.examples.a), toPath(paths.examples.a)],
          target: toPath(paths.targets.l),
        },
        updatedContent: expect.any(String),
      },
    ]);
  });

  it("does not write example to target if write is false", async () => {
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

    await embed({ globPattern, root, write: false });
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

    const actual = await embed({ globPattern, root, write: true });

    expect(actual).toEqual([
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

    await embed({ globPattern, root, write: true });
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

    await embed({ globPattern, root, write: true });
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
