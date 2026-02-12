import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// claude-agent-sdk doesn't resolve @mentions in CLAUDE.md like Claude Code CLI does, so load
// AGENTS.md to give the agent the index; we're still testing that it Read the actual rule files.
const agentsMd = readFileSync(join(repoRoot, "AGENTS.md"), "utf8");

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
        max_turns: 2,
      },
    },
  ],

  prompts: ["file://prompts/generateCode.txt"],

  tests: [
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
  ],
};
