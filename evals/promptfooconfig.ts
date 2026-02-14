import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// claude-agent-sdk doesn't resolve @mentions in CLAUDE.md like Claude Code CLI does, so load
// AGENTS.md to give the agent the index; we're still testing that it Read the actual rule files.
const agentsMd = readFileSync(join(repoRoot, "AGENTS.md"), "utf8");

const textGenFormat =
  "In your final response, output ONLY the requested content directly. Do not include explanation or commentary.";

export default {
  description: "CLAUDE.md rule adherence evals",

  providers: [
    {
      id: "anthropic:claude-agent-sdk",
      config: {
        working_dir: repoRoot,
        setting_sources: ["project"],
        tools: { type: "preset", preset: "claude_code" },
        permission_mode: "default",
        append_system_prompt: agentsMd,
        model: "opus",
        max_turns: 4,
      },
    },
  ],

  prompts: ["file://prompts/generateCode.txt"],

  tests: [
    // Test 1: TypeScript rules (code gen)
    {
      vars: {
        task: [
          "Write a function called `filterActiveWorkers` that takes an array of worker objects.",
          "Each worker has: id (string), isActive (boolean), hasCompletedOnboarding (boolean),",
          "and qualificationId (string | undefined). Return only workers that are active, have",
          "completed onboarding, and have a defined qualificationId. Also write a",
          "`shouldNotifyWorker` function that takes a worker and returns whether they should be",
          "notified based on isActive and hasCompletedOnboarding.",
        ].join(" "),
      },
      assert: [
        { type: "contains", value: "function filterActiveWorkers" },
        { type: "contains", value: "isDefined" },
        {
          type: "regex",
          value: "\\bis[A-Z]\\w*|\\bhas[A-Z]\\w*|\\bshould[A-Z]\\w*",
        },
        { type: "not-contains", value: " as " },
        { type: "javascript", value: "file://assertions/typescriptRules.ts" },
        {
          type: "llm-rubric",
          value: [
            "Boolean properties must use is*/has*/should*/can* prefixes consistently.",
            "The isDefined helper must be used for null/undefined checks instead of",
            "truthy checks or direct === null/undefined comparisons. No type assertions.",
          ].join(" "),
        },
      ],
    },

    // Test 2: Testing rules (code gen)
    {
      vars: {
        task: [
          "Write Jest tests for a function `calculateShiftPay({hourlyRateInMinorUnits, durationMinutes, isOvertime})`",
          "that returns `{totalInMinorUnits}`. Overtime multiplier is 1.5x.",
          "Write tests for: normal pay calculation, overtime pay calculation, zero duration,",
          "and a scenario that uses a mock (e.g., mocking a tax calculation dependency).",
        ].join(" "),
      },
      assert: [
        { type: "contains", value: "describe(" },
        { type: "contains", value: "it(" },
        { type: "not-contains", value: "test(" },
        { type: "regex", value: "\\bexpected\\b" },
        { type: "regex", value: "\\bactual\\b" },
        { type: "javascript", value: "file://assertions/typescriptRules.ts" },
        { type: "javascript", value: "file://assertions/testingRules.ts" },
        {
          type: "llm-rubric",
          value: [
            "Tests must follow Arrange-Act-Assert pattern with blank lines between sections.",
            "Variables should use the naming convention: mockX for mocks, input for inputs,",
            "expected for expected values, actual for actual results.",
            "Uses it() not test() for test declarations. Uses describe() for grouping.",
          ].join(" "),
        },
      ],
    },

    // Test 3: Logging & observability rules (code gen)
    {
      vars: {
        task: [
          "Write an async function `processShiftAssignment` that takes",
          "`{shiftId, workerId, workplaceId, workerEmail}` as parameters.",
          "It should: log info on start with structured context, attempt to process the assignment,",
          "log error on failure with structured context, create a reusable `logContext` object for",
          "shared context across log statements, and increment a Datadog metric on success.",
          "IMPORTANT: workerEmail is PII and must NOT appear in any log statements.",
        ].join(" "),
      },
      assert: [
        { type: "regex", value: "logger\\.info" },
        { type: "regex", value: "logger\\.error" },
        { type: "regex", value: "logContext" },
        { type: "regex", value: "datadogMetrics\\.increment" },
        { type: "javascript", value: "file://assertions/typescriptRules.ts" },
        { type: "javascript", value: "file://assertions/loggingRules.ts" },
        {
          type: "llm-rubric",
          value: [
            "Must use structured logging with context objects instead of string interpolation.",
            "workerEmail must NOT appear as a key in any logger.info/logger.error context object.",
            "Must use correct log levels: info for normal operations, error for failures.",
            "Must create a reusable logContext object for shared context across log statements.",
            "Only evaluate what is directly written in the code; do not speculate about downstream behavior.",
          ].join(" "),
        },
      ],
    },

    // Test 4: Configuration rules (text gen)
    {
      vars: {
        task: [
          "Advise on the configuration strategy for each scenario below.",
          "For each, recommend the appropriate mechanism and explain why.",
          "Scenario A: A payment provider API key that must remain secret.",
          "Scenario B: A max shift duration value (engineer-controlled, can tolerate 1-hour propagation delay).",
          "Scenario C: A gradual rollout flag that needs instant toggling without a deploy.",
        ].join(" "),
        format: textGenFormat,
      },
      assert: [
        { type: "regex", value: "SSM|Parameter Store" },
        { type: "contains", value: "Zod" },
        { type: "regex", value: "LaunchDarkly|feature\\.flag" },
        {
          type: "llm-rubric",
          value: [
            "Scenario A must recommend SSM Parameter Store for secrets.",
            "Scenario B must recommend hardcoding with @clipboard-health/config using Zod schemas.",
            "Scenario C must recommend LaunchDarkly feature flags with @clipboard-health/feature-flags.",
          ].join(" "),
        },
      ],
    },

    // Test 5: Git workflow rules (text gen)
    {
      vars: {
        task: [
          "Write commit messages, PR titles, and PR descriptions for each scenario below.",
          "Scenario 1: A bug fix in shift notifications module, ticket CBH-4521.",
          "Scenario 2: A new workplace API endpoint for listing available shifts, ticket CBH-4590.",
          "Scenario 3: Upgrading NestJS from v10 to v11, ticket CBH-4600.",
        ].join(" "),
        format: textGenFormat,
      },
      assert: [
        { type: "regex", value: "\\b(fix|feat|chore)\\b[(!:]" },
        { type: "regex", value: "CBH-\\d+" },
        {
          type: "llm-rubric",
          value: [
            "Must use Conventional Commits 1.0 format (type(scope): description).",
            "Scenario 1 must use fix type. Scenario 2 must use feat type.",
            "Scenario 3 must use chore type (dependency upgrade, non-functional).",
            "PR descriptions must explain why, not just what. Tickets must be linked.",
          ].join(" "),
        },
      ],
    },
  ],
};
