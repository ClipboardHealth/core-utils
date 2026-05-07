/** @type {import('dependency-cruiser').IConfiguration} */
// dependency-cruiser runs with tsPreCompilationDeps disabled, so modules only referenced by
// `import type`/`export type` are intentionally classified here instead of hidden by a broad glob.
const TYPE_ONLY_ORPHAN_MODULES = [
  String.raw`^packages/config/src/lib/types\.ts$`,
  String.raw`^packages/embedex/src/lib/internal/types\.ts$`,
  String.raw`^packages/embedex/src/lib/types\.ts$`,
  String.raw`^packages/execution-context/src/types/types\.ts$`,
  String.raw`^packages/json-api-nestjs/src/lib/types\.ts$`,
  String.raw`^packages/json-api/src/lib/types\.ts$`,
  String.raw`^packages/mongo-jobs/src/lib/handler\.ts$`,
  String.raw`^packages/mongo-jobs/src/lib/internal/logger\.ts$`,
  String.raw`^packages/mongo-jobs/src/lib/internal/worker/queueConsumer\.ts$`,
  String.raw`^packages/oxlint-config/src/internal/types\.ts$`,
  String.raw`^packages/phone-number/src/lib/types\.ts$`,
  String.raw`^packages/playwright-reporter-llm/src/lib/types\.ts$`,
  String.raw`^packages/rules-engine/src/lib/rule\.ts$`,
  String.raw`^packages/util-ts/src/lib/logger\.ts$`,
  String.raw`^packages/util-ts/src/lib/types\.ts$`,
];

// Files that are valid package entry/subentry/test-support files without static runtime edges.
const INTENTIONAL_ORPHAN_MODULES = [
  String.raw`^packages/eslint-config/src/react\.js$`,
  String.raw`^packages/mongo-jobs/src/lib/testing\.ts$`,
  String.raw`^packages/nx-plugin/src/index\.ts$`,
];

module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "No circular dependencies",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-orphans",
      severity: "error",
      comment: "Modules should be reachable from an entry point",
      from: {
        orphan: true,
        pathNot: [
          String.raw`\.(spec|test)\.ts$`,
          String.raw`\.d\.ts$`,
          String.raw`jest\.config\.ts$`,
          ...TYPE_ONLY_ORPHAN_MODULES,
          ...INTENTIONAL_ORPHAN_MODULES,
        ],
      },
      to: {},
    },
    {
      name: "no-reaching-inside-packages",
      severity: "error",
      comment:
        "Don't import from inside another package's internal files — use the public API (@clipboard-health/*)",
      from: { path: "^packages/([^/]+)/" },
      to: {
        path: "^packages/([^/]+)/src/",
        pathNot: [
          // Allow imports within the same package
          "^packages/$1/",
          // Allow imports to a package's public API (index.ts)
          String.raw`^packages/[^/]+/src/index\.ts$`,
        ],
      },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: false,
    tsConfig: { fileName: "tsconfig.base.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
      mainFields: ["main", "types", "typings"],
    },
    reporterOptions: {
      dot: { collapsePattern: "node_modules/(@[^/]+/[^/]+|[^/]+)" },
      text: { highlightFocused: true },
    },
  },
};
