import { base, createOxlintConfig, jest as jestPreset, react, vitest } from "./index";

describe("oxlint-config", () => {
  describe("presets", () => {
    it("exports the shared base preset", () => {
      expect(base.plugins).toEqual([
        "eslint",
        "typescript",
        "unicorn",
        "oxc",
        "import",
        "jsdoc",
        "node",
        "promise",
      ]);

      expect(base.overrides).toHaveLength(4);
      expect(base.rules).toMatchObject({
        curly: ["error", "all"],
        "import/no-cycle": ["error", { ignoreExternal: true, maxDepth: 16 }],
        "unicorn/no-null": "off",
      });
    });

    it("exports additive plugin presets", () => {
      expect(react).toEqual({
        plugins: ["react"],
      });

      expect(jestPreset).toEqual({
        plugins: ["jest"],
      });

      expect(vitest).toEqual({
        plugins: ["vitest"],
      });
    });
  });

  describe("createOxlintConfig", () => {
    it("returns an empty config when no presets or local config are provided", () => {
      const actual = createOxlintConfig({});

      expect(actual).toEqual({});
    });

    it("merges presets left-to-right and applies local config last", () => {
      const actual = createOxlintConfig({
        localConfig: {
          categories: {
            style: "error",
          },
          env: {
            browser: false,
          },
          globals: {
            window: "off",
          },
          ignorePatterns: ["node_modules/"],
          jsPlugins: ["./plugin-c.js"],
          options: {
            typeCheck: true,
          },
          overrides: [
            {
              files: ["**/*.ts"],
              rules: {
                "no-console": "off",
              },
            },
          ],
          plugins: ["react"],
          rules: {
            "no-console": "off",
          },
          settings: {
            react: {
              version: "19.0.0",
            },
          },
        },
        presets: [
          {
            categories: {
              correctness: "error",
            },
            env: {
              node: true,
            },
            globals: {
              Buffer: "readonly",
            },
            ignorePatterns: ["dist/"],
            jsPlugins: ["./plugin-a.js"],
            options: {
              denyWarnings: true,
            },
            overrides: [
              {
                files: ["**/*.spec.ts"],
                rules: {
                  "max-lines": "off",
                },
              },
            ],
            plugins: ["import"],
            rules: {
              curly: "error",
              "no-console": "warn",
            },
            settings: {
              node: {
                version: ">=24.14.0",
              },
            },
          },
          {
            categories: {
              style: "warn",
            },
            env: {
              browser: true,
            },
            globals: {
              window: "readonly",
            },
            ignorePatterns: ["coverage/"],
            jsPlugins: ["./plugin-b.js"],
            options: {
              typeAware: true,
            },
            overrides: [
              {
                files: ["**/*.tsx"],
                rules: {
                  "react/jsx-key": "error",
                },
              },
            ],
            plugins: ["vitest"],
            rules: {
              curly: ["error", "all"],
              "no-debugger": "error",
            },
            settings: {
              vitest: {
                typecheck: true,
              },
            },
          },
        ],
      });

      expect(actual).toEqual({
        categories: {
          correctness: "error",
          style: "error",
        },
        env: {
          browser: false,
          node: true,
        },
        globals: {
          Buffer: "readonly",
          window: "off",
        },
        ignorePatterns: ["dist/", "coverage/", "node_modules/"],
        jsPlugins: ["./plugin-a.js", "./plugin-b.js", "./plugin-c.js"],
        options: {
          denyWarnings: true,
          typeAware: true,
          typeCheck: true,
        },
        overrides: [
          {
            files: ["**/*.spec.ts"],
            rules: {
              "max-lines": "off",
            },
          },
          {
            files: ["**/*.tsx"],
            rules: {
              "react/jsx-key": "error",
            },
          },
          {
            files: ["**/*.ts"],
            rules: {
              "no-console": "off",
            },
          },
        ],
        plugins: ["import", "vitest", "react"],
        rules: {
          curly: ["error", "all"],
          "no-console": "off",
          "no-debugger": "error",
        },
        settings: {
          node: {
            version: ">=24.14.0",
          },
          react: {
            version: "19.0.0",
          },
          vitest: {
            typecheck: true,
          },
        },
      });
    });
  });
});
