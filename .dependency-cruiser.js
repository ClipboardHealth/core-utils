/** @type {import('dependency-cruiser').IConfiguration} */
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
      severity: "warn",
      comment: "Modules should be reachable from an entry point",
      from: {
        orphan: true,
        pathNot: [
          String.raw`\.(spec|test)\.ts$`,
          String.raw`\.d\.ts$`,
          String.raw`jest\.config\.ts$`,
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
