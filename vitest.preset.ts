import path from "node:path";

import {
  configDefaults,
  coverageConfigDefaults,
  defineConfig,
  type ViteUserConfig,
} from "vitest/config";

interface CoverageThresholds {
  branches: number;
  functions: number;
  lines: number;
  statements: number;
}

interface DefinePackageVitestConfigOptions {
  coverageExclude?: string[];
  coverageThresholds?: CoverageThresholds | null;
  name: string;
  passWithNoTests?: boolean;
  reportsDirectory: string;
  serverDepsInline?: string[];
  testExclude?: string[];
}

const DEFAULT_TEST_INCLUDE = ["src/**/*.spec.ts", "src/**/*.test.ts", "test/**/*.spec.ts"] as const;
const DEFAULT_COVERAGE_INCLUDE = ["src/**"] as const;
const DEFAULT_COVERAGE_EXCLUDE = [
  "src/**/index.ts",
  "src/**/*.d.ts",
  "src/**/*.json",
  "src/**/*.md",
  "src/generators/**/files/**",
] as const;
const DEFAULT_COVERAGE_THRESHOLDS = {
  branches: 100,
  functions: 100,
  lines: 100,
  statements: 100,
} as const;
const WORKSPACE_ROOT = import.meta.dirname;

export function definePackageVitestConfig(
  options: DefinePackageVitestConfigOptions,
): ViteUserConfig {
  const packageRoot = path.join(WORKSPACE_ROOT, "packages", options.name);
  const testConfig: NonNullable<ViteUserConfig["test"]> = {
    coverage: {
      exclude: [
        ...coverageConfigDefaults.exclude,
        ...DEFAULT_COVERAGE_EXCLUDE,
        ...(options.coverageExclude ?? []),
      ],
      include: [...DEFAULT_COVERAGE_INCLUDE],
      provider: "v8",
      reporter: ["lcov", "text"],
      reportsDirectory: options.reportsDirectory,
    },
    environment: "node",
    exclude: [...configDefaults.exclude, ...(options.testExclude ?? [])],
    globals: true,
    include: [...DEFAULT_TEST_INCLUDE],
    name: options.name,
    passWithNoTests: options.passWithNoTests ?? false,
  };

  if (options.coverageThresholds !== null) {
    testConfig.coverage = {
      ...testConfig.coverage,
      thresholds: options.coverageThresholds ?? DEFAULT_COVERAGE_THRESHOLDS,
    };
  }

  if (options.serverDepsInline?.length) {
    testConfig.server = {
      deps: {
        inline: options.serverDepsInline,
      },
    };
  }

  return defineConfig({
    root: packageRoot,
    test: testConfig,
  });
}
