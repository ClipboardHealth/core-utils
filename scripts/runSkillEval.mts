import { spawnSync } from "node:child_process";

type SkillEvalName = "frontend-ui-verification";

interface SkillEvalConfig {
  configPath: string;
  smokeProviderPath: string;
}

const SKILL_EVAL_CONFIGS: Record<SkillEvalName, SkillEvalConfig> = {
  "frontend-ui-verification": {
    configPath: "evals/promptfooconfig.frontend-ui-verification.ts",
    smokeProviderPath: "file://providers/frontendUiVerificationSmokeProvider.ts",
  },
};

interface ParsedArgs {
  skillName: SkillEvalName;
  smoke: boolean;
  promptfooArgs: string[];
}

function isSkillEvalName(value: string): value is SkillEvalName {
  return value === "frontend-ui-verification";
}

function usage(): string {
  return [
    "Usage: node --run eval:skill -- <skill-name> [--smoke] [promptfoo args...]",
    "",
    "Examples:",
    "  node --run eval:skill -- frontend-ui-verification --smoke",
    "  node --run eval:skill -- frontend-ui-verification",
    "  FRONTEND_UI_VERIFICATION_EVAL_PROVIDERS=codex node --run eval:skill -- frontend-ui-verification -- --filter-first-n 1",
    "",
    `Available skill evals: ${Object.keys(SKILL_EVAL_CONFIGS).join(", ")}`,
  ].join("\n");
}

function parseArgs(args: string[]): ParsedArgs {
  const [skillName, ...restArgs] = args;

  if (!skillName) {
    throw new Error(usage());
  }

  if (!isSkillEvalName(skillName)) {
    throw new Error(`Unsupported skill eval: ${skillName}\n\n${usage()}`);
  }

  return {
    skillName,
    smoke: restArgs.includes("--smoke"),
    promptfooArgs: restArgs.filter((arg) => arg !== "--smoke" && arg !== "--"),
  };
}

function runPromptfoo(parsedArgs: ParsedArgs): number {
  const config = SKILL_EVAL_CONFIGS[parsedArgs.skillName];
  const commandArgs = ["eval", "--config", config.configPath];

  if (parsedArgs.smoke) {
    commandArgs.push(
      "--providers",
      config.smokeProviderPath,
      "--no-cache",
      "--no-write",
      "--no-table",
      "--max-concurrency",
      "1",
    );
  }

  commandArgs.push(...parsedArgs.promptfooArgs);

  const result = spawnSync("promptfoo", commandArgs, { stdio: "inherit" });
  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

function main(args: string[]): number {
  if (args[0] === "--help" || args[0] === "-h") {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  return runPromptfoo(parseArgs(args));
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
