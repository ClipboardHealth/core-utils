import {
  base,
  contractFixtures,
  createOxlintConfig,
  customRules,
  frontend,
  jest as jestPreset,
  type OxlintPreset,
  react,
  typeAware,
  vitest,
} from "./index";

describe("oxlint-config", () => {
  describe("presets", () => {
    it("exports the shared base preset plugins, categories, and ignore patterns", () => {
      expect(base.plugins).toStrictEqual([
        "eslint",
        "typescript",
        "unicorn",
        "oxc",
        "import",
        "node",
        "promise",
      ]);

      expect(base.categories).toStrictEqual({
        correctness: "error",
        nursery: "off",
        pedantic: "error",
        perf: "error",
        restriction: "error",
        style: "off",
        suspicious: "error",
      });

      expect(base.ignorePatterns).toStrictEqual([
        ".agents/",
        ".rules/",
        "coverage/",
        "dist/",
        "node_modules/",
      ]);
    });

    it("exports the shared base preset options, settings, overrides, and rules", () => {
      expect(base.options).toStrictEqual({
        denyWarnings: true,
      });

      expect(base.settings).toStrictEqual({
        node: {
          version: ">=24.14.1",
        },
      });

      expect(base.overrides).toHaveLength(3);
      expect(base.rules).toMatchObject({
        curly: ["error", "all"],
        "guard-for-in": "error",
        "import/no-cycle": ["error", { ignoreExternal: true, maxDepth: 16 }],
        "import/no-mutable-exports": "error",
        "no-else-return": ["error", { allowElseIf: false }],
        "no-new-func": "error",
        "no-return-assign": "error",
        "no-script-url": "error",
        "no-template-curly-in-string": "error",
        "node/no-exports-assign": "error",
        "typescript/array-type": ["error", { default: "array-simple" }],
        "unicorn/no-null": "off",
        "no-underscore-dangle": "off",
      });
    });

    it("exports additive plugin presets", () => {
      expect(customRules).toStrictEqual({
        jsPlugins: [
          {
            name: "@clipboard-health",
            specifier: "@clipboard-health/oxlint-plugin",
          },
        ],
        overrides: [
          {
            files: ["**/*.controller.ts", "**/*.controllers.ts"],
            rules: {
              "@clipboard-health/enforce-ts-rest-in-controllers": "error",
            },
          },
          {
            files: ["**/*.module.ts"],
            rules: {
              "@clipboard-health/require-http-module-factory": "error",
            },
          },
          {
            files: ["**/*.contract.ts"],
            rules: {
              "@clipboard-health/require-zod-import-in-contracts": "error",
            },
          },
          {
            files: ["**/*.ts", "**/*.tsx"],
            rules: {
              "@clipboard-health/no-cross-contract-imports": "error",
            },
          },
        ],
      });

      expect(contractFixtures).toStrictEqual({
        jsPlugins: [
          {
            name: "contract-fixtures",
            specifier: "@clipboard-health/oxlint-plugin",
          },
        ],
        overrides: [
          {
            files: [
              "**/{testUtils,test-utils}/{handlers,mocks}*.{cjs,cts,js,jsx,mjs,mts,ts,tsx}",
              "**/testHandlers.{cjs,cts,js,jsx,mjs,mts,ts,tsx}",
              "**/*.{spec,test}.{cjs,cts,js,jsx,mjs,mts,ts,tsx}",
              "playwright/**/*.{cjs,cts,js,jsx,mjs,mts,ts,tsx}",
            ],
            rules: {
              "contract-fixtures/require-contract-fixture-construction": "warn",
            },
          },
        ],
      });

      expect(react).toStrictEqual({
        plugins: ["react"],
      });

      expect(frontend).toStrictEqual({
        jsPlugins: [
          {
            name: "react-doctor",
            specifier: "oxlint-plugin-react-doctor",
          },
        ],
        plugins: ["react", "jsx-a11y"],
        rules: expect.objectContaining({
          "array-callback-return": "error",
          curly: ["error", "all"],
          eqeqeq: ["error", "always"],
          "getter-return": "error",
          "import/first": "warn",
          "import/no-amd": "error",
          "import/no-webpack-loader-syntax": "error",
          "jsx-a11y/anchor-has-content": "error",
          "jsx-a11y/anchor-is-valid": "error",
          "jsx-a11y/aria-props": "error",
          "jsx-a11y/aria-proptypes": "error",
          "jsx-a11y/aria-role": "error",
          "jsx-a11y/aria-unsupported-elements": "error",
          "jsx-a11y/click-events-have-key-events": "error",
          "jsx-a11y/control-has-associated-label": "error",
          "jsx-a11y/heading-has-content": "error",
          "jsx-a11y/iframe-has-title": "error",
          "jsx-a11y/img-redundant-alt": "error",
          "jsx-a11y/interactive-supports-focus": "error",
          "jsx-a11y/label-has-associated-control": "error",
          "jsx-a11y/no-access-key": "error",
          "jsx-a11y/no-autofocus": "error",
          "jsx-a11y/no-distracting-elements": "error",
          "jsx-a11y/no-noninteractive-element-interactions": "error",
          "jsx-a11y/no-redundant-roles": "error",
          "jsx-a11y/no-static-element-interactions": "error",
          "jsx-a11y/prefer-tag-over-role": "off",
          "jsx-a11y/role-has-required-aria-props": "error",
          "jsx-a11y/role-supports-aria-props": "error",
          "jsx-a11y/scope": "error",
          "no-alert": "error",
          "no-array-constructor": "error",
          "no-bitwise": "warn",
          "no-caller": "error",
          "no-console": "warn",
          "no-cond-assign": ["error", "except-parens"],
          "no-const-assign": "error",
          "no-constant-condition": "error",
          "no-control-regex": "error",
          "no-debugger": "error",
          "no-delete-var": "error",
          "no-dupe-keys": "error",
          "no-duplicate-case": "error",
          "no-empty": "error",
          "no-empty-character-class": "error",
          "no-empty-pattern": "error",
          "no-eval": "error",
          "no-ex-assign": "error",
          "no-extend-native": "error",
          "no-extra-bind": "error",
          "no-extra-boolean-cast": "error",
          "no-extra-label": "error",
          "no-fallthrough": "error",
          "no-func-assign": "error",
          "no-implied-eval": "error",
          "no-invalid-regexp": "error",
          "no-irregular-whitespace": "error",
          "no-iterator": "error",
          "no-label-var": "error",
          "no-labels": ["error", { allowLoop: true, allowSwitch: false }],
          "no-lone-blocks": "error",
          "no-loop-func": "error",
          "no-multi-str": "error",
          "no-nested-ternary": "warn",
          "no-new-func": "error",
          "no-new-wrappers": "error",
          "no-obj-calls": "error",
          "no-redeclare": "error",
          "no-regex-spaces": "error",
          "no-restricted-globals": [
            "error",
            "addEventListener",
            "blur",
            "close",
            "closed",
            "confirm",
            "defaultStatus",
            "defaultstatus",
            "event",
            "external",
            "find",
            "focus",
            "frameElement",
            "frames",
            "history",
            "innerHeight",
            "innerWidth",
            "isFinite",
            "isNaN",
            "length",
            "location",
            "locationbar",
            "menubar",
            "moveBy",
            "moveTo",
            "name",
            "onblur",
            "onerror",
            "onfocus",
            "onload",
            "onresize",
            "onunload",
            "open",
            "opener",
            "opera",
            "outerHeight",
            "outerWidth",
            "pageXOffset",
            "pageYOffset",
            "parent",
            "print",
            "removeEventListener",
            "resizeBy",
            "resizeTo",
            "screen",
            "screenLeft",
            "screenTop",
            "screenX",
            "screenY",
            "scroll",
            "scrollbars",
            "scrollBy",
            "scrollTo",
            "scrollX",
            "scrollY",
            "self",
            "status",
            "statusbar",
            "stop",
            "toolbar",
            "top",
          ],
          "no-script-url": "error",
          "no-self-assign": "error",
          "no-self-compare": "error",
          "no-sequences": "error",
          "no-shadow-restricted-names": "error",
          "no-sparse-arrays": "error",
          "no-template-curly-in-string": "error",
          "no-this-before-super": "error",
          "no-throw-literal": "error",
          "no-unexpected-multiline": "error",
          "no-unreachable": "error",
          "no-unused-expressions": [
            "error",
            { allowShortCircuit: true, allowTaggedTemplates: true, allowTernary: true },
          ],
          "no-unused-labels": "error",
          "no-unused-vars": [
            "error",
            {
              args: "all",
              argsIgnorePattern: "(^_)",
              ignoreRestSiblings: true,
              varsIgnorePattern: "(^_)",
            },
          ],
          "no-useless-computed-key": "error",
          "no-useless-concat": "error",
          "no-useless-escape": "error",
          "no-useless-rename": [
            "error",
            { ignoreDestructuring: false, ignoreExport: false, ignoreImport: false },
          ],
          "no-var": "error",
          "no-warning-comments": "off",
          "no-with": "error",
          "object-shorthand": ["error", "always", { avoidQuotes: true }],
          "operator-assignment": ["error", "always"],
          "oxc/bad-array-method-on-arguments": "error",
          "oxc/bad-char-at-comparison": "error",
          "oxc/bad-comparison-sequence": "error",
          "oxc/bad-min-max-func": "error",
          "oxc/bad-object-literal-comparison": "error",
          "oxc/bad-replace-all-arg": "error",
          "oxc/const-comparisons": "error",
          "oxc/double-comparisons": "error",
          "oxc/erasing-op": "error",
          "oxc/missing-throw": "error",
          "oxc/number-arg-out-of-range": "error",
          "oxc/uninvoked-array-callback": "error",
          "prefer-arrow-callback": "error",
          "prefer-const": "error",
          "prefer-destructuring": ["error", { VariableDeclarator: { array: false, object: true } }],
          "prefer-exponentiation-operator": "error",
          "prefer-numeric-literals": "error",
          "prefer-object-spread": "error",
          "prefer-promise-reject-errors": ["error", { allowEmptyReject: true }],
          "prefer-regex-literals": ["error", { disallowRedundantWrapping: true }],
          "react/exhaustive-deps": "warn",
          "react/jsx-filename-extension": ["warn", { extensions: [".tsx", ".jsx"] }],
          "react/jsx-key": "error",
          "react/jsx-no-target-blank": "error",
          "react/jsx-no-comment-textnodes": "error",
          "react/jsx-no-duplicate-props": "error",
          "react/jsx-no-undef": "error",
          "react/jsx-pascal-case": ["error", { allowAllCaps: true }],
          "react/no-danger-with-children": "error",
          "react/no-did-update-set-state": "error",
          "react/no-direct-mutation-state": "error",
          "react/no-is-mounted": "error",
          "react/no-array-index-key": "error",
          "react/require-render-return": "error",
          "react/rules-of-hooks": "error",
          "react/style-prop-object": "error",
          "require-yield": "error",
          "typescript/no-duplicate-enum-values": "error",
          "typescript/no-unsafe-declaration-merging": "error",
          "typescript/no-useless-empty-export": "error",
          "typescript/no-wrapper-object-types": "error",
          "typescript/prefer-as-const": "error",
          "typescript/prefer-optional-chain": "error",
          "unicode-bom": ["error", "never"],
          "unicorn/no-await-in-promise-methods": "error",
          "unicorn/no-invalid-fetch-options": "error",
          "unicorn/no-invalid-remove-event-listener": "error",
          "unicorn/no-single-promise-in-promise-methods": "error",
          "unicorn/prefer-string-starts-ends-with": "error",
          "use-isnan": "error",
          "valid-typeof": "error",
        }),
      });

      const reactDoctorRules = getRulesWithPrefix(frontend.rules, "react-doctor/");
      expect(reactDoctorRules).toHaveLength(145);
      expect(new Set(reactDoctorRules.map(([, severity]) => severity))).toStrictEqual(
        new Set(["error"]),
      );

      expect(typeAware).toStrictEqual({
        rules: {
          "typescript/await-thenable": "error",
          "typescript/no-base-to-string": "error",
          "typescript/no-floating-promises": "error",
          "typescript/no-misused-spread": "error",
          "typescript/no-redundant-type-constituents": "error",
          "typescript/restrict-template-expressions": "error",
          "typescript/unbound-method": "error",
        },
      });

      expect(jestPreset).toStrictEqual({
        plugins: ["jest"],
        rules: {
          "max-lines": ["error", { max: 2000 }],
          "jest/max-expects": "off",
          "jest/max-nested-describe": "off",
          "jest/no-confusing-set-timeout": "off",
          "jest/no-hooks": "off",
          "jest/prefer-ending-with-an-expect": "off",
          "jest/prefer-expect-assertions": "off",
          "jest/prefer-importing-jest-globals": "off",
          "jest/prefer-lowercase-title": "off",
          "jest/valid-title": ["error", { ignoreTypeOfDescribeName: true }],
        },
      });

      expect(vitest).toStrictEqual({
        plugins: ["vitest"],
        rules: {
          "max-lines": ["error", { max: 2000 }],
          "vitest/consistent-test-filename": [
            "error",
            { pattern: String.raw`.*\.(test|spec)\.[tj]sx?$` },
          ],
          "vitest/expect-expect": [
            "error",
            {
              assertFunctionNames: ["expect", "expect*", "expectTypeOf", "assert", "assert*"],
            },
          ],
          "vitest/max-expects": "off",
          "vitest/max-nested-describe": "off",
          "vitest/no-conditional-expect": "off",
          "vitest/no-disabled-tests": "error",
          "vitest/no-focused-tests": "error",
          "vitest/no-hooks": "off",
          "vitest/prefer-called-once": "off",
          "vitest/prefer-expect-assertions": "off",
          "vitest/prefer-import-in-mock": "off",
          "vitest/prefer-importing-vitest-globals": "off",
          "vitest/prefer-lowercase-title": "off",
          "vitest/prefer-to-be-falsy": "off",
          "vitest/prefer-to-be-truthy": "off",
          "vitest/require-hook": "off",
          "vitest/require-mock-type-parameters": "off",
          "vitest/require-test-timeout": "off",
          "vitest/require-to-throw-message": "error",
          "vitest/valid-expect": "error",
          "vitest/valid-title": ["error", { ignoreTypeOfDescribeName: true }],
        },
      });
    });
  });

  describe(createOxlintConfig, () => {
    it("returns an empty config when no presets or local config are provided", () => {
      const actual = createOxlintConfig({});

      expect(actual).toStrictEqual({});
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

      expect(actual).toStrictEqual({
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

    it("preserves settings when a later preset omits them", () => {
      const actual = createOxlintConfig({
        presets: [
          {
            settings: {
              node: {
                version: ">=24.14.0",
              },
            },
          },
          {
            plugins: ["vitest"],
          },
        ],
      });

      expect(actual.settings).toStrictEqual({
        node: {
          version: ">=24.14.0",
        },
      });
    });

    it("merges settings at the plugin namespace level without recursing deeper", () => {
      const actual = createOxlintConfig({
        presets: [
          {
            settings: {
              react: {
                pragma: "React",
                nested: {
                  keep: true,
                },
              },
            },
          },
          {
            settings: {
              react: {
                version: "19",
                nested: {
                  replaced: true,
                },
              },
            },
          },
        ],
      });

      expect(actual.settings).toStrictEqual({
        react: {
          pragma: "React",
          version: "19",
          nested: {
            replaced: true,
          },
        },
      });
    });

    it("does not share rule references between configs", () => {
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

      firstConfig.rules.curly = "off";

      const firstImportNoCycleRuleOptions = getRuleOptions(firstConfig.rules["import/no-cycle"]);
      firstImportNoCycleRuleOptions["maxDepth"] = 1;

      expect(firstConfig.rules).not.toBe(baseConfig.rules);
      expect(firstConfig.rules.curly).toBe("off");
      expect(secondConfig.rules.curly).toStrictEqual(["error", "all"]);
      expect(baseConfig.rules.curly).toStrictEqual(["error", "all"]);
      expect(getRuleOptions(secondConfig.rules["import/no-cycle"])["maxDepth"]).toBe(16);
    });

    it("does not share override references between configs", () => {
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
      const firstOverrideFiles = getFirstOverrideFiles(firstConfig);
      const secondOverrideFiles = getFirstOverrideFiles(secondConfig);
      const baseOverrideFiles = getFirstOverrideFiles(baseConfig);

      firstOverrideFiles.push("**/*.cts");

      expect(firstConfig.overrides).not.toBe(baseConfig.overrides);
      expect(firstOverrideFiles).toContain("**/*.cts");
      expect(secondOverrideFiles).not.toContain("**/*.cts");
      expect(baseOverrideFiles).not.toContain("**/*.cts");
      expect(getRuleOptions(baseConfig.rules["import/no-cycle"])["maxDepth"]).toBe(16);
    });

    it("clones preserved arrays and objects when later presets omit those fields", () => {
      const input: OxlintPreset = {
        overrides: [
          {
            files: ["**/*.ts"],
          },
        ],
        rules: {
          "import/no-cycle": ["error", { maxDepth: 4 }],
        },
      };
      const inputConfig = getConfigWithRulesAndOverrides(input);

      const actual = getConfigWithRulesAndOverrides(
        createOxlintConfig({
          presets: [input, {}],
        }),
      );

      getFirstOverrideFiles(actual).push("**/*.tsx");
      getRuleOptions(actual.rules["import/no-cycle"])["maxDepth"] = 1;

      expect(getFirstOverrideFiles(inputConfig)).toStrictEqual(["**/*.ts"]);
      expect(getRuleOptions(inputConfig.rules["import/no-cycle"])["maxDepth"]).toBe(4);
    });
  });

  describe("invalid preset data", () => {
    it("throws when base.json contains an unsupported oxlint plugin", async () => {
      await expect(
        loadPresetsModule({
          presets: [base],
          overrides: [],
          plugins: ["unsupported-plugin"],
          rules: {},
        }),
      ).rejects.toThrow('Unsupported oxlint plugin "unsupported-plugin".');
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

    it("throws when base.json categories are invalid", async () => {
      await expect(
        loadPresetsModule({
          categories: "not-an-object",
          overrides: [],
          plugins: ["import"],
          rules: {},
        }),
      ).rejects.toThrow("The bundled base.json file is not a valid oxlint config preset.");
    });

    it("throws when vitest.json is not a valid preset", async () => {
      await expect(
        loadPresetsModuleWithVitestJson(
          {
            overrides: [],
            plugins: ["import"],
            rules: {},
          },
          "not-an-object",
        ),
      ).rejects.toThrow("The bundled vitest.json file is not a valid oxlint config preset.");
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

      expect(loadedPresetsModule.base.overrides).toStrictEqual([
        {
          files: ["**/*.ts"],
        },
      ]);
    });
  });
});

function getRulesWithPrefix(
  rules: typeof frontend.rules,
  prefix: string,
): Array<[string, unknown]> {
  return Object.entries(rules ?? {}).filter(([ruleName]) => ruleName.startsWith(prefix));
}

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

function getFirstOverrideFiles(config: {
  overrides: Array<{
    files: string[];
  }>;
}): string[] {
  const [firstOverride] = config.overrides;

  if (firstOverride === undefined) {
    throw new TypeError("Expected config to define at least one override.");
  }

  return firstOverride.files;
}

async function loadPresetsModule(baseJson: unknown): Promise<unknown> {
  return await loadPresetsModuleWithVitestJson(baseJson);
}

async function loadPresetsModuleWithVitestJson(
  baseJson: unknown,
  vitestJson?: unknown,
): Promise<unknown> {
  vi.resetModules();
  // oxlint-disable-next-line jest/no-untyped-mock-factory -- conflicts with consistent-type-imports
  vi.doMock("node:fs", () => ({
    readFileSync: vi.fn<(filePath: string) => string>((filePath) => {
      if (vitestJson !== undefined && filePath.includes("vitest.json")) {
        return JSON.stringify(vitestJson);
      }

      return JSON.stringify(baseJson);
    }),
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
    base: value["base"],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
