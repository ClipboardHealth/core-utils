import { readFileSync } from "node:fs";
import path from "node:path";

import type { AllowWarnDeny, DummyRule, DummyRuleMap, OxlintConfig, OxlintOverride } from "oxlint";

import type { OxlintPreset } from "./types";

const JEST_RULES: DummyRuleMap = {
  "max-lines": ["error", { max: 2000 }],
  "jest/max-expects": "off",
  "jest/max-nested-describe": "off",
  // False-positive explosion: flags spec files that contain no setTimeout call at all
  // when a setup file calls jest.setTimeout (265k diagnostics across 764 clean files
  // in clipboard-health as of oxlint 1.60).
  "jest/no-confusing-set-timeout": "off",
  "jest/no-hooks": "off",
  "jest/prefer-ending-with-an-expect": "off",
  "jest/prefer-expect-assertions": "off",
  "jest/prefer-importing-jest-globals": "off",
  "jest/prefer-lowercase-title": "off",
  "jest/valid-title": ["error", { ignoreTypeOfDescribeName: true }],
} as const;

const REACT_DOCTOR_RULES: DummyRuleMap = {
  "react-doctor/anchor-ambiguous-text": "error",
  "react-doctor/anchor-is-valid": "error",
  "react-doctor/anchor-target-exists": "error",
  "react-doctor/auth-token-in-web-storage": "error",
  "react-doctor/button-has-type": "error",
  "react-doctor/checked-requires-onchange-or-readonly": "error",
  "react-doctor/class-component-missing-component-will-unmount-teardown": "error",
  "react-doctor/client-localstorage-no-version": "error",
  "react-doctor/click-events-have-key-events": "error",
  "react-doctor/debounce-no-cleanup": "error",
  "react-doctor/dialog-has-accessible-name": "error",
  "react-doctor/effect-listener-cleanup-mismatch": "error",
  "react-doctor/effect-listener-cleanup-reference-mismatch": "error",
  "react-doctor/effect-needs-cleanup": "error",
  "react-doctor/effect-observer-needs-disconnect": "error",
  "react-doctor/effect-raf-loop-needs-cancel": "error",
  "react-doctor/effect-remove-listener-inline-handler": "error",
  "react-doctor/hook-import-rename-loses-use-prefix": "error",
  "react-doctor/hooks-no-nan-in-deps": "error",
  "react-doctor/html-label-has-single-control": "error",
  "react-doctor/html-no-invalid-paragraph-child": "error",
  "react-doctor/html-no-invalid-table-nesting": "error",
  "react-doctor/html-no-nested-form": "error",
  "react-doctor/html-no-nested-interactive": "error",
  "react-doctor/iframe-missing-sandbox": "error",
  "react-doctor/jsx-key": "error",
  "react-doctor/jsx-no-target-blank": "error",
  "react-doctor/jsx-numeric-and-leaked-render": "error",
  "react-doctor/media-has-caption": "error",
  "react-doctor/no-adjust-state-on-prop-change": "error",
  "react-doctor/no-arithmetic-on-optional-chained-operand": "error",
  "react-doctor/no-array-find-result-member-access-without-guard": "error",
  "react-doctor/no-array-index-deref-without-bounds-or-empty-guard": "error",
  "react-doctor/no-assertive-status": "error",
  "react-doctor/no-async-effect-callback": "error",
  "react-doctor/no-async-event-handler-without-reentry-guard": "error",
  "react-doctor/no-autoplay-without-muted": "error",
  "react-doctor/no-blocked-paste": "error",
  "react-doctor/no-boolean-toggle-without-functional-update": "error",
  "react-doctor/no-broken-image-source": "error",
  "react-doctor/no-call-component-as-function": "error",
  "react-doctor/no-chain-state-updates": "error",
  "react-doctor/no-children-prop": "error",
  "react-doctor/no-collapsed-literal-or-chain-as-value": "error",
  "react-doctor/no-conflicting-spring-options": "error",
  "react-doctor/no-controlled-input-value-without-state-update": "error",
  "react-doctor/no-create-context-in-render": "error",
  "react-doctor/no-create-object-url-in-render": "error",
  "react-doctor/no-create-object-url-without-revoke": "error",
  "react-doctor/no-create-ref-in-function-component": "error",
  "react-doctor/no-create-store-in-render": "error",
  "react-doctor/no-deprecated-keyboard-event-keycode-which": "error",
  "react-doctor/no-derived-state": "error",
  "react-doctor/no-derived-state-effect": "error",
  "react-doctor/no-derived-useState": "error",
  "react-doctor/no-direct-state-mutation": "error",
  "react-doctor/no-document-start-view-transition": "error",
  "react-doctor/no-effect-chain": "error",
  "react-doctor/no-effect-event-handler": "error",
  "react-doctor/no-effect-with-fresh-deps": "error",
  "react-doctor/no-effect-wrapper-discards-callback-cleanup-return": "error",
  "react-doctor/no-enter-submit-without-ime-composition-guard": "error",
  "react-doctor/no-event-handler": "error",
  "react-doctor/no-event-trigger-state": "error",
  "react-doctor/no-fetch-in-effect": "error",
  "react-doctor/no-fetch-response-used-without-status-check": "error",
  "react-doctor/no-fill-map-element-as-key": "error",
  "react-doctor/no-floating-then-in-jsx-handler": "error",
  "react-doctor/no-focusable-content-in-aria-hidden": "error",
  "react-doctor/no-hydration-branch-on-browser-global": "error",
  "react-doctor/no-impure-state-updater": "error",
  "react-doctor/no-indeterminate-attribute": "error",
  "react-doctor/no-initialize-state": "error",
  "react-doctor/no-invalid-progress-range": "error",
  "react-doctor/no-json-parse-stringify-clone": "error",
  "react-doctor/no-jsx-element-type": "error",
  "react-doctor/no-legacy-class-lifecycles": "error",
  "react-doctor/no-legacy-context-api": "error",
  "react-doctor/no-loading-flag-reset-outside-finally": "error",
  "react-doctor/no-mirror-prop-effect": "error",
  "react-doctor/no-mixed-srcset-descriptors": "error",
  "react-doctor/no-multiple-main-landmarks": "error",
  "react-doctor/no-multiple-unlabeled-navigation-landmarks": "error",
  "react-doctor/no-mutable-in-deps": "error",
  "react-doctor/no-mutate-queried-dom-node-in-component": "error",
  "react-doctor/no-mutate-then-set-or-return-same-reference": "error",
  "react-doctor/no-mutating-array-method-on-prop-or-hook-result": "error",
  "react-doctor/no-mutating-reducer-state": "error",
  "react-doctor/no-namespace": "error",
  "react-doctor/no-nested-component-definition": "error",
  "react-doctor/no-non-literal-selector-query-without-try-catch": "error",
  "react-doctor/no-non-null-assertion-on-maybe-undefined-result": "error",
  "react-doctor/no-nondeterministic-id-value-in-render-body": "error",
  "react-doctor/no-nullish-coalescing-arithmetic-precedence": "error",
  "react-doctor/no-object-keys-values-entries-on-maybe-undefined": "error",
  "react-doctor/no-object-or-array-coerced-to-string-in-template-literal": "error",
  "react-doctor/no-pass-data-to-parent": "error",
  "react-doctor/no-pass-live-state-to-parent": "error",
  "react-doctor/no-path-prefix-containment": "error",
  "react-doctor/no-placeholder-only-field": "error",
  "react-doctor/no-predicate-function-reference-in-boolean-position": "error",
  "react-doctor/no-prevent-default": "error",
  "react-doctor/no-promise-then-side-effect-in-effect-without-catch": "error",
  "react-doctor/no-prop-callback-in-effect": "error",
  "react-doctor/no-prop-callback-in-render": "error",
  "react-doctor/no-random-key": "error",
  "react-doctor/no-ref-callback-cleanup-before-react-19": "error",
  "react-doctor/no-ref-current-in-render": "error",
  "react-doctor/no-reset-all-state-on-prop-change": "error",
  "react-doctor/no-responsive-hidden-accessible-name": "error",
  "react-doctor/no-secrets-in-client-code": "error",
  "react-doctor/no-self-updating-effect": "error",
  "react-doctor/no-set-state-after-await-in-effect": "error",
  "react-doctor/no-set-state-in-render": "error",
  "react-doctor/no-side-effect-in-state-updater-function": "error",
  "react-doctor/no-spread-props-over-defaults-clobbers-with-undefined": "error",
  "react-doctor/no-stale-timer-ref": "error",
  "react-doctor/no-static-motion-config-never": "error",
  "react-doctor/no-string-false-on-boolean-attribute": "error",
  "react-doctor/no-uncontrolled-input": "error",
  "react-doctor/no-unescaped-dynamic-string-in-regexp": "error",
  "react-doctor/no-unguarded-browser-global-in-render-or-hook-init": "error",
  "react-doctor/no-unguarded-numeric-input-parse": "error",
  "react-doctor/no-unguarded-throwing-parse-call": "error",
  "react-doctor/no-uninformative-aria-label": "error",
  "react-doctor/no-unknown-property": "error",
  "react-doctor/no-unowned-async-error-clear": "error",
  "react-doctor/no-unsafe-json-parse": "error",
  "react-doctor/no-whole-object-default-losing-per-key-defaults": "error",
  "react-doctor/no-whole-object-dep-with-member-reads": "error",
  "react-doctor/pointer-capture-needs-cancel-handler": "error",
  "react-doctor/prefer-html-dialog": "error",
  "react-doctor/prefer-tag-over-role": "error",
  "react-doctor/prefer-use-sync-external-store": "error",
  "react-doctor/prefer-useReducer": "error",
  "react-doctor/radio-input-missing-name": "error",
  "react-doctor/react-markdown-unsanitized-raw-html": "error",
  "react-doctor/rendering-conditional-render": "error",
  "react-doctor/rerender-dependencies": "error",
  "react-doctor/rerender-lazy-state-init": "error",
  "react-doctor/role-button-requires-complete-keyboard-activation": "error",
  "react-doctor/waapi-animation-in-render": "error",
  "react-doctor/web-animation-offsets-valid": "error",
  "react-doctor/webgl-no-sync-readback-in-animation-loop": "error",
  "react-doctor/window-open-without-noopener": "error",
} as const;

const FRONTEND_RULES: DummyRuleMap = {
  "array-callback-return": "error",
  curly: ["error", "all"],
  eqeqeq: ["error", "always"],
  "getter-return": "error",
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
  "no-caller": "error",
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
  "react/jsx-no-comment-textnodes": "error",
  "react/jsx-no-duplicate-props": "error",
  "react/jsx-no-target-blank": "error",
  "react/jsx-no-undef": "error",
  "react/jsx-pascal-case": ["error", { allowAllCaps: true }],
  "react/no-array-index-key": "error",
  "react/no-danger-with-children": "error",
  "react/no-did-update-set-state": "error",
  "react/no-direct-mutation-state": "error",
  "react/no-is-mounted": "error",
  "react/require-render-return": "error",
  "react/rules-of-hooks": "error",
  "react/style-prop-object": "error",
  "require-yield": "error",
  "unicode-bom": ["error", "never"],
  "use-isnan": "error",
  "valid-typeof": "error",
} as const;

const TYPE_AWARE_RULES: DummyRuleMap = {
  "typescript/await-thenable": "error",
  "typescript/no-base-to-string": "error",
  "typescript/no-floating-promises": "error",
  "typescript/no-misused-spread": "error",
  "typescript/no-redundant-type-constituents": "error",
  "typescript/restrict-template-expressions": "error",
  "typescript/unbound-method": "error",
} as const;

// See https://oxc.rs/docs/guide/usage/linter/plugins.html#supported-plugins
const OXLINT_PLUGIN_NAMES = {
  eslint: "eslint",
  import: "import",
  jest: "jest",
  jsdoc: "jsdoc",
  "jsx-a11y": "jsx-a11y",
  nextjs: "nextjs",
  node: "node",
  oxc: "oxc",
  promise: "promise",
  react: "react",
  "react-perf": "react-perf",
  typescript: "typescript",
  unicorn: "unicorn",
  vitest: "vitest",
  vue: "vue",
} as const;

type OxlintPluginName = NonNullable<OxlintConfig["plugins"]>[number];

interface BaseJsonOverride {
  files: string[];
  rules?: NonNullable<OxlintOverride["rules"]>;
}

interface BaseJsonConfig {
  categories?: NonNullable<OxlintPreset["categories"]>;
  ignorePatterns?: NonNullable<OxlintPreset["ignorePatterns"]>;
  options?: NonNullable<OxlintPreset["options"]>;
  overrides: BaseJsonOverride[];
  plugins: string[];
  rules: NonNullable<OxlintPreset["rules"]>;
  settings?: NonNullable<OxlintPreset["settings"]>;
}

export const base = createBasePreset();
export const react: OxlintPreset = {
  plugins: ["react"],
};
export const frontend: OxlintPreset = {
  jsPlugins: [
    {
      name: "react-doctor",
      specifier: "oxlint-plugin-react-doctor",
    },
  ],
  plugins: ["react", "jsx-a11y"],
  rules: { ...FRONTEND_RULES, ...REACT_DOCTOR_RULES },
};
export const jest: OxlintPreset = {
  plugins: ["jest"],
  rules: JEST_RULES,
};
export const typeAware: OxlintPreset = {
  rules: TYPE_AWARE_RULES,
};
export const vitest: OxlintPreset = createVitestPreset();
export const customRules: OxlintPreset = {
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
};
export const contractFixtures: OxlintPreset = {
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
};

function createBasePreset(): OxlintPreset {
  const parsedBaseJson = loadBaseJson();
  const preset: OxlintPreset = {
    overrides: parsedBaseJson.overrides.map(createOverride),
    plugins: normalizePlugins(parsedBaseJson.plugins),
    rules: parsedBaseJson.rules,
  };

  if (parsedBaseJson.categories !== undefined) {
    preset.categories = parsedBaseJson.categories;
  }

  if (parsedBaseJson.ignorePatterns !== undefined) {
    preset.ignorePatterns = parsedBaseJson.ignorePatterns;
  }

  if (parsedBaseJson.options !== undefined) {
    preset.options = parsedBaseJson.options;
  }

  if (parsedBaseJson.settings !== undefined) {
    preset.settings = parsedBaseJson.settings;
  }

  return preset;
}

function createOverride(override: BaseJsonOverride): OxlintOverride {
  const normalizedOverride: OxlintOverride = {
    files: [...override.files],
  };

  if (override.rules !== undefined) {
    normalizedOverride.rules = override.rules;
  }

  return normalizedOverride;
}

function isOxlintPluginName(plugin: string): plugin is OxlintPluginName {
  return Object.hasOwn(OXLINT_PLUGIN_NAMES, plugin);
}

function normalizePlugins(plugins: string[]): OxlintPluginName[] {
  return plugins.map((plugin) => {
    if (isOxlintPluginName(plugin)) {
      return plugin;
    }

    throw new Error(`Unsupported oxlint plugin "${plugin}".`);
  });
}

function createVitestPreset(): OxlintPreset {
  const vitestJsonPath = path.resolve(__dirname, "../vitest.json");
  const json = parseUnknownJson(readFileSync(vitestJsonPath, "utf8"));

  if (!isPlainObject(json) || !isStringArray(json["plugins"]) || !isRuleMap(json["rules"])) {
    throw new Error("The bundled vitest.json file is not a valid oxlint config preset.");
  }

  return {
    plugins: normalizePlugins(json["plugins"].filter((p) => !base.plugins?.some((bp) => bp === p))),
    rules: json["rules"],
  };
}

function loadBaseJson(): BaseJsonConfig {
  const baseJsonPath = path.resolve(__dirname, "../base.json");
  const json = parseUnknownJson(readFileSync(baseJsonPath, "utf8"));

  if (isBaseJsonConfig(json)) {
    return json;
  }

  throw new Error("The bundled base.json file is not a valid oxlint config preset.");
}

function parseUnknownJson(json: string): unknown {
  return JSON.parse(json) as unknown;
}

function isBaseJsonConfig(value: unknown): value is BaseJsonConfig {
  if (!isPlainObject(value)) {
    return false;
  }

  const { categories, ignorePatterns, options, settings } = value;

  return (
    isStringArray(value["plugins"]) &&
    isRuleMap(value["rules"]) &&
    isOverrideArray(value["overrides"]) &&
    (categories === undefined || isCategoryMap(categories)) &&
    (ignorePatterns === undefined || isStringArray(ignorePatterns)) &&
    (options === undefined || isPlainObject(options)) &&
    (settings === undefined || isPlainObject(settings))
  );
}

function isOverrideArray(value: unknown): value is BaseJsonOverride[] {
  return Array.isArray(value) && value.every(isBaseJsonOverride);
}

function isBaseJsonOverride(value: unknown): value is BaseJsonOverride {
  if (!isPlainObject(value)) {
    return false;
  }

  const { files, rules } = value;
  return isStringArray(files) && (rules === undefined || isRuleMap(rules));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCategoryMap(value: unknown): value is NonNullable<OxlintPreset["categories"]> {
  if (!isPlainObject(value)) {
    return false;
  }

  return Object.values(value).every(isAllowWarnDeny);
}

function isRuleMap(value: unknown): value is NonNullable<OxlintPreset["rules"]> {
  if (!isPlainObject(value)) {
    return false;
  }

  return Object.values(value).every(isDummyRule);
}

function isDummyRule(value: unknown): value is DummyRule {
  return isAllowWarnDeny(value) || isRuleTuple(value);
}

function isRuleTuple(value: unknown): value is [AllowWarnDeny, ...unknown[]] {
  return Array.isArray(value) && value.length > 0 && isAllowWarnDeny(value[0]);
}

function isAllowWarnDeny(value: unknown): value is AllowWarnDeny {
  return (
    value === 0 ||
    value === 1 ||
    value === 2 ||
    value === "allow" ||
    value === "off" ||
    value === "warn" ||
    value === "error" ||
    value === "deny"
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
