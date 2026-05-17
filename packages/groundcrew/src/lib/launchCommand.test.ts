import { statSync } from "node:fs";

import { DEFAULT_REMOTE_SETUP_COMMAND, type ModelDefinition } from "./config.ts";
import {
  buildLaunchCommand,
  buildRemoteLaunchCommand,
  resolveSafehouseClearancePath,
} from "./launchCommand.ts";
import { spriteRemoteRunnerProvider } from "./spriteRemoteRunnerProvider.ts";

const REMOTE_SECRET_NAMES = ["NPM_TOKEN", "BUF_TOKEN"] as const;

function arguments_(
  overrides: Partial<Parameters<typeof buildLaunchCommand>[0]> = {},
): Parameters<typeof buildLaunchCommand>[0] {
  return {
    definition: { cmd: "claude", color: "#fff" } satisfies ModelDefinition,
    promptFile: "/tmp/prompt-team-1/prompt.txt",
    worktreeDir: "/work/repo-a-team-1",
    ...overrides,
  };
}

function remoteArguments(
  overrides: Partial<Parameters<typeof buildRemoteLaunchCommand>[0]> = {},
): Parameters<typeof buildRemoteLaunchCommand>[0] {
  return {
    definition: { cmd: "claude --worktree {{worktree}}", color: "#fff" } satisfies ModelDefinition,
    provider: spriteRemoteRunnerProvider,
    remoteConfig: {
      provider: "sprite",
      runnerName: "crew-claude-1",
      owner: "ClipboardHealth",
      repoRoot: "/home/sprite/dev",
      worktreeRoot: "/home/sprite/groundcrew/worktrees",
      secretNames: [...REMOTE_SECRET_NAMES],
    },
    promptFile: "/tmp/prompt-team-1/prompt.txt",
    remotePromptFile: "/tmp/groundcrew-team-1-prompt.txt",
    worktreeDir: "/home/sprite/groundcrew/worktrees/repo-a-team-1",
    secretNames: [...REMOTE_SECRET_NAMES],
    ...overrides,
  };
}

function decodedSpriteRemoteCommand(command: string): string {
  const matches = [...command.matchAll(/[A-Za-z0-9+/]{40,}={0,2}/g)];
  expect(matches).toHaveLength(1);
  return Buffer.from(matches[0]?.[0] ?? "", "base64").toString("utf8");
}

describe(resolveSafehouseClearancePath, () => {
  it("resolves through Node module resolution to the real safehouse-clearance file", () => {
    const wrapperPath = resolveSafehouseClearancePath();

    expect(wrapperPath).toMatch(/clearance\/safehouse\/safehouse-clearance$/);
    expect(statSync(wrapperPath).isFile()).toBe(true);
  });

  it("wraps resolution failure in a guidance error naming clearance and groundcrew", () => {
    // A non-absolute, non-file-URL baseUrl makes `createRequire` itself throw
    // ERR_INVALID_ARG_VALUE before any node_modules walk, so this assertion is
    // deterministic regardless of globalPaths, NODE_PATH, or $HOME/.node_modules.
    expect(() => resolveSafehouseClearancePath("relative/path/that/createRequire/rejects")).toThrow(
      /@clipboard-health\/clearance.*groundcrew/,
    );
  });
});

describe(buildLaunchCommand, () => {
  it("keeps the default remote setup command valid for shell control flow", () => {
    expect(DEFAULT_REMOTE_SETUP_COMMAND).not.toContain("then;");
    expect(DEFAULT_REMOTE_SETUP_COMMAND).not.toContain("then ;");
    expect(DEFAULT_REMOTE_SETUP_COMMAND).toContain('nvm install "$required_node"');
    expect(DEFAULT_REMOTE_SETUP_COMMAND).toContain('n_path="$(command -v n || true)"');
    expect(DEFAULT_REMOTE_SETUP_COMMAND).toContain(
      'if "$n_path" "$required_node"; then :; elif command -v sudo >/dev/null 2>&1; then sudo "$n_path" "$required_node"; else exit 1; fi',
    );
    expect(DEFAULT_REMOTE_SETUP_COMMAND).not.toContain('sudo "$n_path" "$required_node" &&');
  });

  it("cd's into the worktree, runs setup, then execs the Safehouse-wrapped agent with the prompt", () => {
    const out = buildLaunchCommand(arguments_());

    expect(out).toContain("cd '/work/repo-a-team-1'");
    expect(out).toContain("_p=$(cat '/tmp/prompt-team-1/prompt.txt')");
    expect(out).toContain("rm -rf '/tmp/prompt-team-1'");
    expect(out).toContain("exec '/");
    expect(out).toContain("/packages/clearance/safehouse/safehouse-clearance' claude");
    expect(out).toMatch(/claude "\$_p"$/);
  });

  it("does not double-wrap when cmd already starts with safehouse", () => {
    const out = buildLaunchCommand(
      arguments_({
        definition: { cmd: "safehouse claude", color: "#fff" },
      }),
    );

    expect(out).toMatch(/exec safehouse claude "\$_p"$/);
    expect(out).not.toContain("safehouse safehouse");
  });

  it("substitutes {{worktree}} and {{sandbox}} in the agent command", () => {
    const out = buildLaunchCommand(
      arguments_({
        definition: {
          cmd: "claude --worktree {{worktree}} --sandbox {{sandbox}}",
          color: "#fff",
        },
      }),
    );

    expect(out).toContain("--worktree '/work/repo-a-team-1'");
    // `{{sandbox}}` is a legacy placeholder; local runs no longer have one.
    expect(out).toContain("--sandbox ''");
    expect(out).not.toContain("{{worktree}}");
    expect(out).not.toContain("{{sandbox}}");
  });

  it("escapes single quotes in worktree paths so the shell quoting survives", () => {
    const out = buildLaunchCommand(
      arguments_({
        worktreeDir: "/work/it's-fine",
        promptFile: "/tmp/it's-fine/prompt.txt",
      }),
    );

    expect(out).toContain(String.raw`cd '/work/it'\''s-fine'`);
    expect(out).toContain(String.raw`_p=$(cat '/tmp/it'\''s-fine/prompt.txt')`);
  });

  it("includes a non-zero setup-status warning", () => {
    const out = buildLaunchCommand(arguments_());

    expect(out).toContain("setup_status=$?");
    expect(out).toContain("groundcrew setup command exited with status $setup_status");
  });

  describe("secretsFile (build-time secret shuttling)", () => {
    it("omits source/unset lines when secretsFile is undefined", () => {
      const out = buildLaunchCommand(arguments_());

      expect(out).not.toContain("secrets.env");
      expect(out).not.toContain("unset NPM_TOKEN");
      expect(out).not.toContain("unset BUF_TOKEN");
    });

    it("sources secretsFile before setup and clears the names before exec", () => {
      const out = buildLaunchCommand(arguments_({ secretsFile: "/tmp/prompt-team-1/secrets.env" }));

      const sourceIndex = out.indexOf(". '/tmp/prompt-team-1/secrets.env'");
      const setupIndex = out.indexOf("setup_status=$?");
      const unsetIndex = out.indexOf("unset NPM_TOKEN BUF_TOKEN");
      const execIndex = out.indexOf("safehouse-clearance");
      expect(sourceIndex).toBeGreaterThan(-1);
      expect(setupIndex).toBeGreaterThan(sourceIndex);
      expect(unsetIndex).toBeGreaterThan(setupIndex);
      expect(execIndex).toBeGreaterThan(unsetIndex);
      expect(out).toContain(
        "if [ -f '/tmp/prompt-team-1/secrets.env' ]; then set -a && . '/tmp/prompt-team-1/secrets.env' && set +a; fi",
      );
    });

    it("also sources and clears secrets before the Safehouse-wrapped command", () => {
      const out = buildLaunchCommand(arguments_({ secretsFile: "/tmp/prompt-team-1/secrets.env" }));

      expect(out).toContain(". '/tmp/prompt-team-1/secrets.env'");
      expect(out).toContain("unset NPM_TOKEN BUF_TOKEN");
      expect(out).toMatch(/safehouse-clearance' claude "\$_p"$/);
    });
  });
});

describe(buildRemoteLaunchCommand, () => {
  it("keeps the host command on one physical line for cmux", () => {
    const out = buildRemoteLaunchCommand(remoteArguments());

    expect(out).not.toContain("\n");
  });

  it("uploads the prompt, runs in the remote worktree, and execs the agent with the prompt", () => {
    const out = buildRemoteLaunchCommand(remoteArguments());
    const remoteCommand = decodedSpriteRemoteCommand(out);

    expect(out).toContain("cleanup() { rm -rf '/tmp/prompt-team-1'; }");
    expect(out).toContain("sprite exec --tty -s 'crew-claude-1'");
    expect(out).toContain(
      "--file '/tmp/prompt-team-1/prompt.txt:/tmp/groundcrew-team-1-prompt.txt'",
    );
    expect(out).toContain("--dir '/home/sprite/groundcrew/worktrees/repo-a-team-1'");
    expect(remoteCommand).toContain("_p=$(cat");
    expect(remoteCommand).toContain("/tmp/groundcrew-team-1-prompt.txt");
    expect(remoteCommand).toContain("exec claude --worktree");
    expect(remoteCommand).toContain("/home/sprite/groundcrew/worktrees/repo-a-team-1");
    expect(remoteCommand).toContain('"$_p"');
  });

  it("uploads build secrets for setup only and clears configured names before agent exec", () => {
    const out = buildRemoteLaunchCommand(
      remoteArguments({
        secretsFile: "/tmp/prompt-team-1/secrets.env",
        remoteSecretsFile: "/tmp/groundcrew-team-1-secrets.env",
      }),
    );
    const remoteCommand = decodedSpriteRemoteCommand(out);

    expect(out).toContain(
      "--file '/tmp/prompt-team-1/secrets.env:/tmp/groundcrew-team-1-secrets.env'",
    );
    expect(remoteCommand).toContain("set -a && .");
    expect(remoteCommand).toContain("/tmp/groundcrew-team-1-secrets.env");
    expect(remoteCommand).toContain("unset NPM_TOKEN BUF_TOKEN");
    expect(out).not.toContain("npm_test_token");
    expect(out).not.toContain("buf_test_token");
    expect(remoteCommand.indexOf("set -a && .")).toBeLessThan(
      remoteCommand.indexOf("setup_status=$?"),
    );
    expect(remoteCommand.indexOf("unset NPM_TOKEN BUF_TOKEN")).toBeLessThan(
      remoteCommand.indexOf("exec claude"),
    );
  });

  it("substitutes {{sandbox}} with an empty value for the remote runner", () => {
    const out = buildRemoteLaunchCommand(
      remoteArguments({
        definition: {
          cmd: "claude --sandbox {{sandbox}} --worktree {{worktree}}",
          color: "#fff",
        },
      }),
    );
    const remoteCommand = decodedSpriteRemoteCommand(out);

    expect(remoteCommand).toContain("--sandbox");
    expect(remoteCommand).not.toContain("{{sandbox}}");
    expect(remoteCommand).not.toContain("{{worktree}}");
  });
});
