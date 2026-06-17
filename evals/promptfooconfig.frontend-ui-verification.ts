import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.join(import.meta.dirname, "..");
const agentsMd = readFileSync(path.join(repoRoot, "AGENTS.md"), "utf8");

type ProviderName = "claude" | "codex";

interface PromptfooProvider {
  id: string;
  label: string;
  config: Record<string, unknown>;
}

const providerMap: Record<ProviderName, PromptfooProvider> = {
  claude: {
    // Promptfoo provider ID for the Claude agent adapter.
    id: "anthropic:claude-agent-sdk",
    label: "claude-agent",
    config: {
      working_dir: repoRoot,
      setting_sources: ["project"],
      tools: { type: "preset", preset: "claude_code" },
      permission_mode: "default",
      append_system_prompt: agentsMd,
      model: "opus",
      max_turns: 6,
    },
  },
  codex: {
    // Promptfoo provider ID for the Codex agent adapter.
    id: "openai:codex-sdk",
    label: "codex-agent",
    config: {
      working_dir: repoRoot,
      sandbox_mode: "read-only",
      approval_policy: "never",
      model_reasoning_effort: "medium",
      collaboration_mode: "coding",
      model: "gpt-5-codex",
    },
  },
};

function isProviderName(providerName: string): providerName is ProviderName {
  return providerName === "claude" || providerName === "codex";
}

function parseProviderNames(): ProviderName[] {
  // oxlint-disable-next-line node/no-process-env -- Manual evals choose Claude, Codex, or both without duplicating configs.
  const rawProviderNames = process.env.FRONTEND_UI_VERIFICATION_EVAL_PROVIDERS ?? "claude,codex";

  const providerNames: ProviderName[] = [];

  for (const rawProviderName of rawProviderNames.split(",")) {
    const providerName = rawProviderName.trim();
    if (!providerName) {
      continue;
    }

    if (!isProviderName(providerName)) {
      throw new Error(`Unsupported frontend UI verification eval provider: ${providerName}`);
    }

    if (!providerNames.includes(providerName)) {
      providerNames.push(providerName);
    }
  }

  if (providerNames.length === 0) {
    throw new Error("FRONTEND_UI_VERIFICATION_EVAL_PROVIDERS did not include any providers");
  }

  return providerNames;
}

const providers = parseProviderNames().map((providerName) => providerMap[providerName]);

const sharedAssertions = [
  {
    type: "skill-used",
    value: "frontend-ui-verification",
  },
  {
    type: "javascript",
    value: "file://assertions/frontendUiVerificationWorkflow.ts",
  },
] as const;

// oxlint-disable import/no-anonymous-default-export
export default {
  description: "Frontend UI verification skill regression evals",

  providers,

  prompts: ["file://prompts/frontendUiVerification.txt"],

  tests: [
    {
      vars: {
        scenario: "figma",
        surface: "admin",
        task: [
          "In cbh-admin-frontend, implement a Figma-driven redesign of an admin approval tray.",
          "The Figma URL is https://www.figma.com/design/abc123/Admin-Approval?node-id=10-20.",
          "The UI includes dense rows, a primary approve action, a secondary defer action, and an info banner.",
        ].join(" "),
      },
      assert: sharedAssertions,
    },
    {
      vars: {
        scenario: "figma",
        surface: "mobile",
        task: [
          "In cbh-mobile-app, recreate a Figma design for a worker saved-shift bottom sheet.",
          "The Figma URL is https://www.figma.com/design/def456/Mobile-Saved-Shift?node-id=31-42.",
          "The sheet includes shift details, a saved status pill, long workplace names, and primary/secondary actions.",
        ].join(" "),
      },
      assert: sharedAssertions,
    },
    {
      vars: {
        scenario: "screenshot",
        surface: "admin",
        task: [
          "In cbh-admin-frontend, build a compact admin review panel from a static screenshot reference.",
          "The screenshot shows three stacked cards, a warning banner, an approve button, and a disabled secondary action.",
          "No Figma URL is available.",
        ].join(" "),
      },
      assert: sharedAssertions,
    },
    {
      vars: {
        scenario: "idea",
        surface: "mobile",
        task: [
          "In cbh-mobile-app, add a new visual idea: before workers browse open shifts, show a small preference nudge",
          "letting them tune distance, shift time, and pay preferences.",
          "There is no Figma URL and no screenshot.",
        ].join(" "),
      },
      assert: sharedAssertions,
    },
    {
      vars: {
        scenario: "motion",
        surface: "admin",
        task: [
          "In cbh-admin-frontend, refine stacked admin bottom-sheet motion for a nested approval drawer.",
          "The parent sheet should remain visually stable while the child sheet opens, settles, dismisses, and rapidly reopens.",
          "This is a polish task with animation behavior as the main risk.",
        ].join(" "),
      },
      assert: [
        ...sharedAssertions,
        {
          type: "skill-used",
          value: "clipboard-design-engineering",
        },
      ],
    },
  ],
};
