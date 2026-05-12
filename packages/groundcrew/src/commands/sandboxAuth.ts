import { runCommandAsync } from "../lib/commandRunner.ts";
import { loadConfig, type ResolvedConfig, type SandboxDefinition } from "../lib/config.ts";
import { sandboxExists, sandboxNameFor } from "../lib/sandbox.ts";
import { log } from "../lib/util.ts";
import { repoDirFor } from "../lib/worktrees.ts";

interface SandboxAuthOptions {
  repository: string;
  model: string;
}

function parseArguments(argv: string[], config: ResolvedConfig): SandboxAuthOptions {
  const arguments_ = [...argv];
  const validModels = Object.keys(config.models.definitions).filter(
    (model) => config.models.definitions[model]?.sandbox !== undefined,
  );
  let model = config.models.default;

  const modelIndex = arguments_.indexOf("--model");
  if (modelIndex !== -1) {
    const [value] = arguments_.splice(modelIndex + 1, 1);
    if (value === undefined) {
      throw new Error(
        `--model requires a value. Valid sandbox-backed models from config: ${validModels.join(", ")}`,
      );
    }
    if (!validModels.includes(value)) {
      throw new Error(
        `Invalid --model: ${value}. Valid sandbox-backed models from config: ${validModels.join(", ")}`,
      );
    }
    model = value;
    arguments_.splice(modelIndex, 1);
  }

  const [repository, ...extra] = arguments_;
  if (repository === undefined || extra.length > 0) {
    throw new Error(
      `Usage: crew sandbox auth [--model ${validModels.join("|")}] <repository>\n` +
        "Example: crew sandbox auth <repository>",
    );
  }

  return { repository, model };
}

function sandboxCreateArguments(arguments_: {
  sandboxName: string;
  sandbox: SandboxDefinition;
  repoDir: string;
}): string[] {
  const createArguments = ["run", "--name", arguments_.sandboxName];
  if (arguments_.sandbox.template !== undefined) {
    createArguments.push("--template", arguments_.sandbox.template);
  }
  for (const kit of arguments_.sandbox.kits ?? []) {
    createArguments.push("--kit", kit);
  }
  createArguments.push(arguments_.sandbox.agent, arguments_.repoDir);
  return createArguments;
}

export async function authSandbox(
  config: ResolvedConfig,
  options: SandboxAuthOptions,
): Promise<void> {
  const { repository, model } = options;
  const definition = config.models.definitions[model];
  if (definition === undefined) {
    throw new Error(`Unknown model: ${model}`);
  }
  if (definition.sandbox === undefined) {
    throw new Error(`Model ${model} is not sandbox-backed`);
  }

  const repoDir = repoDirFor(config, repository);
  const sandboxName = sandboxNameFor({ repository, model });

  if (definition.sandbox.agent === "codex") {
    log("Starting host-side OpenAI OAuth for Docker Sandboxes...");
    await runCommandAsync("sbx", ["secret", "set", "-g", "openai", "--oauth"], {
      stdio: "inherit",
    });
  }

  if (await sandboxExists(sandboxName)) {
    log(`Reusing sbx sandbox ${sandboxName}; attach and complete any login prompt.`);
    await runCommandAsync("sbx", ["run", sandboxName], { stdio: "inherit" });
    return;
  }

  log(`Creating sbx sandbox ${sandboxName}; attach and complete any login prompt.`);
  await runCommandAsync(
    "sbx",
    sandboxCreateArguments({ sandboxName, sandbox: definition.sandbox, repoDir }),
    {
      stdio: "inherit",
    },
  );
}

export async function sandboxAuthCli(argv: string[]): Promise<void> {
  const [action, ...rest] = argv;
  if (action !== "auth") {
    throw new Error("Usage: crew sandbox auth <repository> [--model <name>]");
  }
  const config = await loadConfig();
  const options = parseArguments(rest, config);
  await authSandbox(config, options);
}
