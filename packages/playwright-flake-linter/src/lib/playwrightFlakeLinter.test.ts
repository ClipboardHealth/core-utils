import { readFile } from "node:fs/promises";
import path from "node:path";

import type { PlaywrightFlakeRuleId } from "./playwrightFlakeLinter";
import {
  definePlaywrightFlakeLinterConfig,
  findPlaywrightFlakePatternViolations,
} from "./playwrightFlakeLinter";

const FIXTURES_ROOT = path.resolve(import.meta.dirname, "../../test/fixtures/playwright");
const RULE_FIXTURES = [
  ["fixed-sleep", "fixed-sleep"],
  ["response-wait", "response-wait"],
  ["retry-classification", "retry-classification"],
  ["test-data-identity", "test-data-identity"],
  ["shared-readiness", "shared-readiness"],
] satisfies ReadonlyArray<readonly [string, PlaywrightFlakeRuleId]>;
const FIXTURE_NAMES = RULE_FIXTURES.map(([fixtureName]) => fixtureName);
const config = definePlaywrightFlakeLinterConfig({
  hardenedIdentityHelperNames: ["generateRandomUserEmail"],
  identityHelperMinimumLengths: {
    generateRandomAlphaNumericString: 24,
    generateRandomString: 26,
  },
  retryHelperNames: ["retry"],
  scanRoots: ["playwright"],
  sharedReadinessMechanisms: [
    {
      directCallNames: ["waitForResponse"],
      filePathPattern: String.raw`playwright/e2e/homeHealth/.*\.spec\.ts$`,
      name: "Home Health response readiness",
      sharedHelperNames: ["waitForHomeHealthResponse"],
    },
  ],
  transientClassifierNamePatterns: ["^isRetryable", "retryClassification"],
  undiscriminatingRetryHelperNames: ["retryUntilPassOrTimeout", "toPass"],
});

describe("findPlaywrightFlakePatternViolations", () => {
  it.each(RULE_FIXTURES)(
    "reports the %s fixture with the rubric and preferred alternative",
    async (fixtureName, expectedRuleId) => {
      const actual = await lintFixture({
        fixtureName,
        variant: "violation",
      });

      expect(actual).toHaveLength(1);
      expect(actual[0]).toMatchObject({ ruleId: expectedRuleId });
      expect(actual[0]?.message).toMatch(/rubric [A-Z]\d/);
      expect(actual[0]?.message).toMatch(/Use|Replace|Retry|Match/);
    },
  );

  it.each(FIXTURE_NAMES)("accepts the compliant %s fixture", async (fixtureName) => {
    const actual = await lintFixture({
      fixtureName,
      variant: "compliant",
    });

    expect(actual).toEqual([]);
  });

  it.each(FIXTURE_NAMES)(
    "accepts the reason-bearing inline allowlist for %s",
    async (fixtureName) => {
      const actual = await lintFixture({
        fixtureName,
        variant: "allowlisted",
      });

      expect(actual).toEqual([]);
    },
  );

  it("uses repository-specific helper and shared-mechanism configuration", () => {
    const customConfig = definePlaywrightFlakeLinterConfig({
      identityHelperMinimumLengths: {
        mobileRandomSuffix: 32,
      },
      retryHelperNames: ["retryMobileAction"],
      scanRoots: ["e2e"],
      sharedReadinessMechanisms: [
        {
          directCallNames: ["waitForResponse"],
          filePathPattern: String.raw`e2e/sheets/.*\.spec\.tsx$`,
          name: "BottomSheet readiness",
          sharedHelperNames: ["waitForBottomSheet"],
        },
      ],
      transientClassifierNamePatterns: ["^isTransientMobile"],
    });
    const source = `
      const workerName = mobileRandomSuffix(8);
      await retryMobileAction(async () => createWorker());
      await page.waitForResponse((response) => response.ok());
    `;

    const actual = findPlaywrightFlakePatternViolations({
      config: customConfig,
      filePath: "e2e/sheets/worker.spec.tsx",
      source,
    });

    expect(actual.map(({ ruleId }) => ruleId)).toEqual([
      "test-data-identity",
      "retry-classification",
      "response-wait",
      "shared-readiness",
    ]);
    expect(actual.at(-1)?.message).toContain("waitForBottomSheet");
  });

  it("supports a readiness mechanism with a repository-specific direct call", () => {
    const customConfig = definePlaywrightFlakeLinterConfig({
      scanRoots: ["e2e"],
      sharedReadinessMechanisms: [
        {
          directCallNames: ["waitForBottomSheetResponse"],
          filePathPattern: String.raw`e2e/sheets/.*\.spec\.tsx$`,
          name: "BottomSheet readiness",
          sharedHelperNames: ["waitForBottomSheet"],
        },
      ],
    });

    const actual = findPlaywrightFlakePatternViolations({
      config: customConfig,
      filePath: "e2e/sheets/worker.spec.tsx",
      source: "await page.waitForBottomSheetResponse(isReady);",
    });

    expect(actual.map(({ ruleId }) => ruleId)).toEqual(["shared-readiness"]);
  });

  it("flags timestamp identities that bypass configured hardened helpers", () => {
    const interpolation = `${String.fromCodePoint(36)}{Date.now()}`;

    const actual = findPlaywrightFlakePatternViolations({
      config,
      filePath: "playwright/e2e/example.spec.ts",
      source: `const workerEmail = \`worker-${interpolation}@example.com\`;`,
    });

    expect(actual.map(({ ruleId }) => ruleId)).toEqual(["test-data-identity"]);
  });

  it("supports a reason-bearing repository allowlist", () => {
    const allowlistedConfig = definePlaywrightFlakeLinterConfig({
      ...config,
      allowlist: [
        {
          filePathPattern: String.raw`legacy/.*\.spec\.ts$`,
          reason: "The timer fixture verifies elapsed product time.",
          ruleId: "fixed-sleep",
        },
      ],
    });

    const actual = findPlaywrightFlakePatternViolations({
      config: allowlistedConfig,
      filePath: "playwright/e2e/legacy/timer.spec.ts",
      source: "await page.waitForTimeout(100);",
    });

    expect(actual).toEqual([]);
  });

  it("rejects inline allowlists without a reason", () => {
    const actual = findPlaywrightFlakePatternViolations({
      config,
      filePath: "playwright/e2e/example.spec.ts",
      source: `
        // flake-lint-allow fixed-sleep
        await page.waitForTimeout(100);
      `,
    });

    expect(actual.map(({ ruleId }) => ruleId)).toEqual(["fixed-sleep"]);
  });

  it("rejects repository allowlists without a reason", () => {
    expect(() =>
      definePlaywrightFlakeLinterConfig({
        ...config,
        allowlist: [
          {
            filePathPattern: "legacy",
            reason: " ",
            ruleId: "fixed-sleep",
          },
        ],
      }),
    ).toThrow("allowlist reason");
  });

  it("flags bare and qualified setTimeout sleeps in specs", () => {
    const actual = findPlaywrightFlakePatternViolations({
      config,
      filePath: "playwright/e2e/example.spec.ts",
      source: `
        await new Promise((resolve) => setTimeout(resolve, 100));
        await new Promise((resolve) => globalThis.setTimeout(resolve, 100));
      `,
    });

    expect(actual.map(({ ruleId }) => ruleId)).toEqual(["fixed-sleep", "fixed-sleep"]);
  });

  it("follows named predicate result dependencies", () => {
    const actual = findPlaywrightFlakePatternViolations({
      config,
      filePath: "playwright/e2e/example.spec.ts",
      source: `
        const isReady = (response) => {
          const methodMatches = response.request().method() === "POST";
          const url = new URL(response.url());
          const identityMatches = url.searchParams.get("workerId") === workerId;
          return methodMatches && identityMatches && response.ok();
        };
        await page.waitForResponse(isReady);
      `,
    });

    expect(actual).toEqual([]);
  });

  it("allows a delegated specific-request matcher", () => {
    const actual = findPlaywrightFlakePatternViolations({
      config,
      filePath: "playwright/e2e/example.spec.ts",
      source: `
        function isReady(response) {
          return isMatchingRequest(response.request()) && response.ok();
        }
        await page.waitForResponse(isReady);
      `,
    });

    expect(actual).toEqual([]);
  });

  it("uses repository-specific delegated request matcher names", () => {
    const customConfig = definePlaywrightFlakeLinterConfig({
      scanRoots: ["playwright"],
      specificRequestMatcherNames: ["matchesMobileRequest"],
    });
    const actual = findPlaywrightFlakePatternViolations({
      config: customConfig,
      filePath: "playwright/e2e/example.spec.ts",
      source: `
        await page.waitForResponse(
          (response) => matchesMobileRequest(response.request()) && response.ok()
        );
      `,
    });

    expect(actual).toEqual([]);
  });

  it("does not count unused request inspection as discrimination", () => {
    const actual = findPlaywrightFlakePatternViolations({
      config,
      filePath: "playwright/e2e/example.spec.ts",
      source: `
        await page.waitForResponse((response) => {
          response.request().method();
          response.url();
          response.request().postDataJSON();
          return response.ok();
        });
      `,
    });

    expect(actual.map(({ ruleId }) => ruleId)).toEqual(["response-wait"]);
  });

  it("accepts a dynamic URL segment as a discriminating request property", () => {
    const actual = findPlaywrightFlakePatternViolations({
      config,
      filePath: "playwright/e2e/example.spec.ts",
      source: `
        await page.waitForResponse(
          (response) =>
            response.request().method() === "GET" &&
            response.url().endsWith(\`/workers/\${workerId}\`) &&
            response.ok()
        );
      `,
    });

    expect(actual).toEqual([]);
  });

  it("flags unresolved retry callbacks and always-undiscriminating methods", () => {
    const actual = findPlaywrightFlakePatternViolations({
      config,
      filePath: "playwright/helpers/retry.ts",
      source: `
        await retry(createWorker);
        await expect(async () => createWorker()).toPass();
      `,
    });

    expect(actual.map(({ ruleId }) => ruleId)).toEqual([
      "retry-classification",
      "retry-classification",
    ]);
  });

  it("accepts configured transient classifier identifiers", () => {
    const actual = findPlaywrightFlakePatternViolations({
      config,
      filePath: "playwright/helpers/retry.ts",
      source: `
        await retry(async (bail) => {
          const retryClassification = classifyError();
          if (retryClassification === "permanent") {
            return bail();
          }
          throw new Error("transient");
        });
      `,
    });

    expect(actual).toEqual([]);
  });

  it("flags non-literal random lengths and Math.random identities", () => {
    const actual = findPlaywrightFlakePatternViolations({
      config,
      filePath: "playwright/e2e/example.spec.ts",
      source: `
        const workerName = generateRandomString(randomLength);
        const workerEmail = Math.random();
      `,
    });

    expect(actual.map(({ ruleId }) => ruleId)).toEqual([
      "test-data-identity",
      "test-data-identity",
    ]);
  });

  it("allows timestamp calculations outside identity contexts", () => {
    const actual = findPlaywrightFlakePatternViolations({
      config,
      filePath: "playwright/e2e/example.spec.ts",
      source: "const expiresAt = Date.now() + 60_000;",
    });

    expect(actual).toEqual([]);
  });

  it("does not let an enclosing allowlist suppress nested statements", () => {
    const actual = findPlaywrightFlakePatternViolations({
      config,
      filePath: "playwright/e2e/example.spec.ts",
      source: `
        // flake-lint-allow fixed-sleep -- This applies only to the test declaration.
        test("loads", async ({ page }) => {
          await page.waitForTimeout(100);
        });
      `,
    });

    expect(actual.map(({ ruleId }) => ruleId)).toEqual(["fixed-sleep"]);
  });

  it("rejects empty scan roots and invalid configured patterns", () => {
    expect(() =>
      definePlaywrightFlakeLinterConfig({
        scanRoots: [],
      }),
    ).toThrow("scan root");
    expect(() =>
      definePlaywrightFlakeLinterConfig({
        scanRoots: ["playwright"],
        specFilePattern: "[",
      }),
    ).toThrow("Invalid spec file pattern");
  });

  it("rejects unusable identity and shared-readiness configuration", () => {
    expect(() =>
      definePlaywrightFlakeLinterConfig({
        identityHelperMinimumLengths: {
          randomSuffix: 0,
        },
        scanRoots: ["playwright"],
      }),
    ).toThrow("positive integer");
    expect(() =>
      definePlaywrightFlakeLinterConfig({
        scanRoots: ["playwright"],
        sharedReadinessMechanisms: [
          {
            directCallNames: ["waitForResponse"],
            filePathPattern: "playwright",
            name: "response readiness",
            sharedHelperNames: [],
          },
        ],
      }),
    ).toThrow("shared helper");
  });
});

interface LintFixtureParams {
  fixtureName: string;
  variant: "allowlisted" | "compliant" | "violation";
}

async function lintFixture({
  fixtureName,
  variant,
}: LintFixtureParams): Promise<ReturnType<typeof findPlaywrightFlakePatternViolations>> {
  const filePath = getFixtureFilePath({ fixtureName, variant });
  const source = await readFile(path.join(FIXTURES_ROOT, filePath), "utf8");

  return findPlaywrightFlakePatternViolations({
    config,
    filePath: `playwright/${filePath.slice(0, -".txt".length)}`,
    source,
  });
}

function getFixtureFilePath({ fixtureName, variant }: LintFixtureParams): string {
  if (fixtureName === "shared-readiness") {
    return `e2e/homeHealth/${fixtureName}.${variant}.spec.ts.txt`;
  }

  if (fixtureName === "retry-classification") {
    return `helpers/${fixtureName}.${variant}.ts.txt`;
  }

  return `e2e/${fixtureName}.${variant}.spec.ts.txt`;
}
