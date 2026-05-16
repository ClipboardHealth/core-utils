import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ensureClearance } from "@clipboard-health/clearance";

import { fetchResolvedIssue } from "../lib/boardSource.ts";
import {
  BUILD_SECRET_NAMES,
  loadConfig,
  type ResolvedConfig,
  type WorkspaceRunner,
} from "../lib/config.ts";
import { detectHostCapabilities } from "../lib/host.ts";
import {
  buildLaunchCommand,
  buildSpriteLaunchCommand,
  shellSingleQuote,
} from "../lib/launchCommand.ts";
import { assertLocalRunnerRequirements } from "../lib/localRunner.ts";
import { errorMessage, getLinearClient, log, readEnvironmentVariable } from "../lib/util.ts";
import { workspaces } from "../lib/workspaces.ts";
import { repoDirFor, type WorktreeEntry, worktrees } from "../lib/worktrees.ts";

interface TicketDetails {
  title: string;
  description: string;
}

async function fetchTicket(ticket: string): Promise<TicketDetails> {
  const client = getLinearClient();
  const issue = await client.issue(ticket.toUpperCase());
  return {
    title: issue.title,
    description: issue.description ?? "",
  };
}

export interface SetupWorkspaceOptions {
  ticket: string;
  repository: string;
  model: string;
  runner?: WorkspaceRunner;
  /** When provided, skip the Linear lookup for prompt-template fields. */
  details?: TicketDetails;
}

export interface SetupWorkspaceRunOptions {
  signal?: AbortSignal;
}

function renderPrompt(
  template: string,
  variables: { ticket: string; worktree: string; title: string; description: string },
): string {
  return template
    .replaceAll("{{ticket}}", variables.ticket)
    .replaceAll("{{worktree}}", variables.worktree)
    .replaceAll("{{title}}", variables.title)
    .replaceAll("{{description}}", variables.description);
}

/**
 * Stage a `KEY='value'` env file for any populated build-time secret so
 * the launch command can source it. Returns `undefined` when groundcrew
 * has nothing to forward, leaving the launch command unchanged. The temp
 * dir is `rm -rf`'d by the launch command (and rollback path), so cleanup
 * is already handled.
 */
function stageBuildSecrets(
  promptDir: string,
  secretNames: readonly string[] = BUILD_SECRET_NAMES,
): string | undefined {
  const lines: string[] = [];
  for (const name of secretNames) {
    const value = readEnvironmentVariable(name);
    if (value === undefined || value.length === 0) {
      continue;
    }
    lines.push(`${name}=${shellSingleQuote(value)}`);
  }
  if (lines.length === 0) {
    return undefined;
  }
  const secretsFile = join(promptDir, "secrets.env");
  writeFileSync(secretsFile, `${lines.join("\n")}\n`, { mode: 0o600 });
  return secretsFile;
}

function stageLaunchScript(promptDir: string, command: string): string {
  const launcherFile = join(promptDir, "launch.sh");
  writeFileSync(launcherFile, `#!/usr/bin/env bash\n${command}\n`, { mode: 0o700 });
  return launcherFile;
}

export async function setupWorkspace(
  config: ResolvedConfig,
  options: SetupWorkspaceOptions,
  runOptions: SetupWorkspaceRunOptions = {},
): Promise<void> {
  const { ticket, repository, model } = options;
  const runner = options.runner ?? "local";
  const { signal } = runOptions;
  const definition = config.models.definitions[model];
  if (!definition) {
    throw new Error(`Unknown model: ${model}`);
  }

  if (runner === "sprite") {
    await setupSpriteWorkspace({
      config,
      options: { ...options, runner },
      ...(signal === undefined ? {} : { signal }),
    });
    return;
  }

  assertLocalRunnerRequirements(await detectHostCapabilities(signal));
  await ensureClearance({ logger: log });

  const spec = { repository, ticket, model, runner };
  const created =
    signal === undefined
      ? await worktrees.create(config, spec)
      : await worktrees.create(config, spec, signal);
  const { branchName, dir: launchDir } = created;
  const worktreeName = `${repository}-${ticket}`;

  // Anything that fails after the worktree is on disk must roll it back
  // (the worktree and the just-created branch). `workspaces.open` cleans
  // up its own workspace on a status-paint failure but does not auto-
  // close on unrecognized cmux output — closing by title there could hit
  // a same-named sibling, so we log a hint and accept a rare leak.
  // Without rollback the next tick hits "Worktree already exists" and
  // the ticket strands forever.
  let promptDir: string | undefined;
  try {
    let ticketDetails: TicketDetails;
    if (options.details === undefined) {
      log(`Fetching ${ticket} from Linear...`);
      ticketDetails = await fetchTicket(ticket);
    } else {
      ticketDetails = options.details;
    }

    promptDir = mkdtempSync(join(tmpdir(), `groundcrew-${ticket}-`));
    const promptFile = join(promptDir, "prompt.txt");
    writeFileSync(
      promptFile,
      renderPrompt(config.prompts.initial, {
        ticket,
        worktree: worktreeName,
        title: ticketDetails.title,
        description: ticketDetails.description,
      }),
    );

    const secretsFile = stageBuildSecrets(promptDir);

    const launchCmd = buildLaunchCommand({
      definition,
      promptFile,
      worktreeDir: launchDir,
      secretsFile,
    });

    log("Opening workspace...");
    await workspaces.open(
      config,
      {
        name: ticket,
        cwd: launchDir,
        command: launchCmd,
        status: { text: model, color: definition.color, icon: "sparkle" },
      },
      signal,
    );

    log(`Workspace "${ticket}" launched (${model})`);
    log(`  Worktree: ${launchDir}`);
    log(`  Branch:   ${branchName}`);
  } catch (error) {
    await rollbackWorktree({ config, entry: created, promptDir });
    throw error;
  }
}

async function resolveTicketDetails(options: SetupWorkspaceOptions): Promise<TicketDetails> {
  if (options.details !== undefined) {
    return options.details;
  }
  log(`Fetching ${options.ticket} from Linear...`);
  return await fetchTicket(options.ticket);
}

async function setupSpriteWorkspace(arguments_: {
  config: ResolvedConfig;
  options: SetupWorkspaceOptions & { runner: "sprite" };
  signal?: AbortSignal;
}): Promise<void> {
  const { config, options, signal } = arguments_;
  const { ticket, repository, model } = options;
  const definition = config.models.definitions[model];
  /* v8 ignore next 3 @preserve -- setupWorkspace validates the model before routing here */
  if (definition === undefined) {
    throw new Error(`Unknown model: ${model}`);
  }

  log(`Workspace runner: sprite (${config.remote.sprite.spriteName})`);
  const spec = { repository, ticket, model, runner: "sprite" as const };
  const created =
    signal === undefined
      ? await worktrees.create(config, spec)
      : await worktrees.create(config, spec, signal);
  const { branchName, dir: remoteWorktreeDir } = created;
  const worktreeName = `${repository}-${ticket}`;

  let promptDir: string | undefined;
  try {
    const ticketDetails = await resolveTicketDetails(options);
    promptDir = mkdtempSync(join(tmpdir(), `groundcrew-${ticket}-`));
    const promptFile = join(promptDir, "prompt.txt");
    writeFileSync(
      promptFile,
      renderPrompt(config.prompts.initial, {
        ticket,
        worktree: worktreeName,
        title: ticketDetails.title,
        description: ticketDetails.description,
      }),
    );

    const secretsFile = stageBuildSecrets(promptDir, config.remote.sprite.secretNames);
    const remotePromptFile = `/tmp/groundcrew-${ticket}-prompt.txt`;
    const remoteSecretsFile =
      secretsFile === undefined ? undefined : `/tmp/groundcrew-${ticket}-secrets.env`;
    const spriteLaunchCommand = buildSpriteLaunchCommand({
      definition,
      spriteName: config.remote.sprite.spriteName,
      promptFile,
      remotePromptFile,
      worktreeDir: remoteWorktreeDir,
      secretNames: config.remote.sprite.secretNames,
      ...(secretsFile === undefined ? {} : { secretsFile, remoteSecretsFile }),
    });
    const launchCmd = `bash ${shellSingleQuote(stageLaunchScript(promptDir, spriteLaunchCommand))}`;

    log("Opening workspace...");
    await workspaces.open(
      config,
      {
        name: ticket,
        cwd: repoDirFor(config, repository),
        command: launchCmd,
        status: { text: `${model}:remote`, color: definition.color, icon: "sparkle" },
      },
      signal,
    );

    log(`Workspace "${ticket}" launched (${model}, sprite)`);
    log(`  Worktree: ${remoteWorktreeDir}`);
    log(`  Branch:   ${branchName}`);
    log(`  Sprite:   ${config.remote.sprite.spriteName}`);
  } catch (error) {
    await rollbackWorktree({ config, entry: created, promptDir });
    throw error;
  }
}

async function rollbackWorktree(arguments_: {
  config: ResolvedConfig;
  entry: WorktreeEntry;
  promptDir: string | undefined;
}): Promise<void> {
  log(
    `Setup failed; rolling back worktree ${arguments_.entry.repository}-${arguments_.entry.ticket}...`,
  );
  let result: Awaited<ReturnType<typeof worktrees.teardown>> | undefined;
  try {
    result = await worktrees.teardown(arguments_.config, [arguments_.entry], { force: true });
  } catch (error) {
    log(`Worktree teardown failed during rollback: ${errorMessage(error)}`);
  } finally {
    if (arguments_.promptDir !== undefined) {
      try {
        rmSync(arguments_.promptDir, { recursive: true, force: true });
      } catch {
        // The launch command would have removed this; silent on retry races.
      }
    }
  }
  if (result === undefined) {
    return;
  }
  if (result.workspaceProbe.kind === "unavailable") {
    // The Workspace adapter was unavailable, so teardown couldn't enumerate
    // (or close) the just-opened workspace. The Worktree was still removed
    // — the user is likely left with an orphaned workspace pointing at a
    // gone directory; surface this so they can close it manually.
    const detail =
      result.workspaceProbe.error === undefined
        ? ""
        : `: ${errorMessage(result.workspaceProbe.error)}`;
    log(
      `Workspace adapter unavailable during rollback${detail}; close ${arguments_.entry.ticket} by hand if it's still open.`,
    );
  }
  for (const failure of result.failures) {
    log(`Worktree teardown ${failure.step} failed: ${errorMessage(failure.error)}`);
  }
}

export async function setupWorkspaceCli(
  ticket: string,
  options: { dryRun?: boolean } = {},
): Promise<void> {
  const config = await loadConfig();
  const client = getLinearClient();
  const resolved = await fetchResolvedIssue({ client, config, ticket });
  log(
    `Resolved ${ticket}: repository=${resolved.repository}, model=${resolved.model}, runner=${resolved.runner}`,
  );
  if (options.dryRun === true) {
    log(
      `[dry-run] Would launch ${ticket} in ${resolved.repository} (${resolved.model}, ${resolved.runner})`,
    );
    return;
  }
  await setupWorkspace(config, {
    ticket: ticket.toLowerCase(),
    repository: resolved.repository,
    model: resolved.model,
    runner: resolved.runner,
    details: { title: resolved.title, description: resolved.description },
  });
}
