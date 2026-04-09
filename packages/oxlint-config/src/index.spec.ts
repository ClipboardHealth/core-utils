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

    it("does not share preset references with returned configs", () => {
      const firstConfig = getConfigWithRulesAndOverrides(
        createOxlintConfig({
          presets: [base],
        }),
      );
      const secondConfig = getConfigWithRulesAndOverrides(
        createOxlintConfig({
          presets: [base],
        }),
      );
      const baseConfig = getConfigWithRulesAndOverrides(base);

      firstConfig.overrides[0].files.push("**/*.cts");
      firstConfig.rules["curly"] = "off";

      const firstImportNoCycleRuleOptions = getRuleOptions(firstConfig.rules["import/no-cycle"]);
      firstImportNoCycleRuleOptions["maxDepth"] = 1;

      expect(firstConfig.rules).not.toBe(baseConfig.rules);
      expect(firstConfig.overrides).not.toBe(baseConfig.overrides);
      expect(firstConfig.rules["curly"]).toBe("off");
      expect(secondConfig.rules["curly"]).toEqual(["error", "all"]);
      expect(baseConfig.rules["curly"]).toEqual(["error", "all"]);
      expect(firstConfig.overrides[0].files).toContain("**/*.cts");
      expect(secondConfig.overrides[0].files).not.toContain("**/*.cts");
      expect(baseConfig.overrides[0].files).not.toContain("**/*.cts");
      expect(getRuleOptions(secondConfig.rules["import/no-cycle"])["maxDepth"]).toBe(16);
      expect(getRuleOptions(baseConfig.rules["import/no-cycle"])["maxDepth"]).toBe(16);
    });

    it("clones preserved arrays and objects when later presets omit those fields", () => {
      const input = {
        overrides: [
          {
            files: ["**/*.ts"],
          },
        ],
        rules: {
          "import/no-cycle": ["error", { maxDepth: 4 }],
        },
      };

      const actual = getConfigWithRulesAndOverrides(
        createOxlintConfig({
          presets: [input, {}],
        }),
      );

      actual.overrides[0].files.push("**/*.tsx");
      getRuleOptions(actual.rules["import/no-cycle"])["maxDepth"] = 1;

      expect(input.overrides[0].files).toEqual(["**/*.ts"]);
      expect(getRuleOptions(input.rules["import/no-cycle"])["maxDepth"]).toBe(4);
    });
  });

  describe("invalid preset data", () => {
    afterEach(() => {
      jest.resetModules();
      jest.unmock("node:fs");
    });

    it("throws when base.json contains an unsupported oxlint plugin", async () => {
      await expect(
        loadPresetsModule({
          presets: [base],
          overrides: [],
          plugins: ["unsupported-plugin"],
          rules: {},
        }),
      ).rejects.toThrow('Unsupported oxlint plugin "unsupported-plugin" in base.json.');
    });

    it("throws when base.json is not an object", async () => {
      await expect(loadPresetsModule([])).rejects.toThrow(
        "The bundled base.json file is not a valid oxlint config preset.",
      );
    });

    it("throws when base.json overrides are invalid", async () => {
      await expect(
        loadPresetsModule({
          overrides: [false],
          plugins: ["import"],
          rules: {},
        }),
      ).rejects.toThrow("The bundled base.json file is not a valid oxlint config preset.");
    });

    it("throws when base.json rules are invalid", async () => {
      await expect(
        loadPresetsModule({
          overrides: [],
          plugins: ["import"],
          rules: [],
        }),
      ).rejects.toThrow("The bundled base.json file is not a valid oxlint config preset.");
    });

    it("supports valid overrides without rules", async () => {
      const loadedPresetsModule = getLoadedPresetsModule(
        await loadPresetsModule({
          overrides: [
            {
              files: ["**/*.ts"],
            },
          ],
          plugins: ["import"],
          rules: {},
        }),
      );

      expect(loadedPresetsModule.base.overrides).toEqual([
        {
          files: ["**/*.ts"],
        },
      ]);
    });
  });
});

function getRuleOptions(rule: unknown): Record<string, unknown> {
  if (!Array.isArray(rule)) {
    throw new TypeError("Expected oxlint rule to be a tuple.");
  }

  const [, options] = rule;

  if (!isRecord(options)) {
    throw new TypeError("Expected oxlint rule options to be an object.");
  }

  return options;
}

function getConfigWithRulesAndOverrides(config: typeof base): {
  overrides: NonNullable<typeof base.overrides>;
  rules: NonNullable<typeof base.rules>;
} {
  const { overrides, rules } = config;

  if (overrides === undefined || rules === undefined) {
    throw new TypeError("Expected config to define overrides and rules.");
  }

  return { overrides, rules };
}

async function loadPresetsModule(baseJson: unknown): Promise<unknown> {
  jest.resetModules();
  jest.doMock("node:fs", () => ({
    readFileSync: jest.fn(() => JSON.stringify(baseJson)),
  }));

  return await import("./internal/presets");
}

function getLoadedPresetsModule(value: unknown): {
  base: { overrides?: Array<{ files: string[]; rules?: Record<string, unknown> }> };
} {
  if (!isRecord(value) || !("base" in value) || !isRecord(value["base"])) {
    throw new TypeError("Expected presets module to expose a base preset.");
  }

  return {
    base: value["base"] as {
      overrides?: Array<{ files: string[]; rules?: Record<string, unknown> }>;
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
