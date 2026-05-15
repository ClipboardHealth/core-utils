import { DEFAULT_SANDBOX_SETUP_COMMAND, type ModelDefinition } from "./config.ts";
import { buildLaunchCommand, buildSpriteLaunchCommand } from "./launchCommand.ts";

function arguments_(
  overrides: Partial<Parameters<typeof buildLaunchCommand>[0]> = {},
): Parameters<typeof buildLaunchCommand>[0] {
  return {
    definition: { cmd: "claude", color: "#fff" } satisfies ModelDefinition,
    promptFile: "/tmp/prompt-team-1/prompt.txt",
    worktreeDir: "/work/repo-a-team-1",
    sandboxName: undefined,
    strategy: "none",
    ...overrides,
  };
}

function spriteArguments(
  overrides: Partial<Parameters<typeof buildSpriteLaunchCommand>[0]> = {},
): Parameters<typeof buildSpriteLaunchCommand>[0] {
  return {
    definition: { cmd: "claude --worktree {{worktree}}", color: "#fff" } satisfies ModelDefinition,
    spriteName: "crew-claude-1",
    promptFile: "/tmp/prompt-team-1/prompt.txt",
    remotePromptFile: "/tmp/groundcrew-team-1-prompt.txt",
    worktreeDir: "/home/sprite/groundcrew/worktrees/repo-a-team-1",
    secretNames: ["NPM_TOKEN", "BUF_TOKEN"],
    ...overrides,
  };
}

function decodedSpriteRemoteCommand(command: string): string {
  const matches = [...command.matchAll(/[A-Za-z0-9+/]{40,}={0,2}/g)];
  expect(matches).toHaveLength(1);
  return Buffer.from(matches[0]?.[0] ?? "", "base64").toString("utf8");
}

describe(buildLaunchCommand, () => {
  it("keeps the default sandbox setup command valid for shell control flow", () => {
    expect(DEFAULT_SANDBOX_SETUP_COMMAND).not.toContain("then;");
    expect(DEFAULT_SANDBOX_SETUP_COMMAND).not.toContain("then ;");
    expect(DEFAULT_SANDBOX_SETUP_COMMAND).toContain('nvm install "$required_node"');
    expect(DEFAULT_SANDBOX_SETUP_COMMAND).toContain('n_path="$(command -v n || true)"');
  });

  it("none strategy cd's into the worktree, runs setup, then execs the agent with the prompt", () => {
    const out = buildLaunchCommand(arguments_({ strategy: "none" }));

    expect(out).toContain("cd '/work/repo-a-team-1'");
    expect(out).toContain("_p=$(cat '/tmp/prompt-team-1/prompt.txt')");
    expect(out).toContain("rm -rf '/tmp/prompt-team-1'");
    expect(out).toMatch(/exec claude "\$_p"$/);
  });

  it("safehouse strategy wraps the agent command with the clearance profile", () => {
    const out = buildLaunchCommand(arguments_({ strategy: "safehouse" }));

    expect(out).toContain("exec '/");
    expect(out).toContain("/packages/clearance/safehouse/safehouse-clearance' claude");
    expect(out).toMatch(/claude "\$_p"$/);
  });

  it("safehouse strategy does not double-wrap when cmd already starts with safehouse", () => {
    const out = buildLaunchCommand(
      arguments_({
        definition: { cmd: "safehouse claude", color: "#fff" },
        strategy: "safehouse",
      }),
    );

    expect(out).toMatch(/exec safehouse claude "\$_p"$/);
    expect(out).not.toContain("safehouse safehouse");
  });

  it("docker strategy builds an sbx exec ... sh -lc command", () => {
    const out = buildLaunchCommand(
      arguments_({
        definition: {
          cmd: "claude",
          color: "#fff",
          isolation: "docker",
          sandbox: { agent: "claude" },
        },
        sandboxName: "groundcrew-repo-a-claude",
        strategy: "docker",
      }),
    );

    expect(out).toContain(
      "exec sbx exec -it -w '/work/repo-a-team-1' 'groundcrew-repo-a-claude' sh -lc",
    );
    expect(out).toContain("exec claude");
  });

  it("docker strategy uses the sandbox setupCommand override when configured", () => {
    const out = buildLaunchCommand(
      arguments_({
        definition: {
          cmd: "claude",
          color: "#fff",
          isolation: "docker",
          sandbox: { agent: "claude", setupCommand: "echo custom-setup" },
        },
        sandboxName: "groundcrew-repo-a-claude",
        strategy: "docker",
      }),
    );

    expect(out).toContain("echo custom-setup");
  });

  it("substitutes {{worktree}} and {{sandbox}} in the agent command (none strategy)", () => {
    const out = buildLaunchCommand(
      arguments_({
        definition: {
          cmd: "claude --worktree {{worktree}} --sandbox {{sandbox}}",
          color: "#fff",
        },
        strategy: "none",
      }),
    );

    expect(out).toContain("--worktree '/work/repo-a-team-1'");
    // sandbox is empty on the none strategy — substitutes to empty quotes.
    expect(out).toContain("--sandbox ''");
    expect(out).not.toContain("{{worktree}}");
    expect(out).not.toContain("{{sandbox}}");
  });

  it("escapes single quotes in worktree paths so the shell quoting survives", () => {
    const out = buildLaunchCommand(
      arguments_({
        worktreeDir: "/work/it's-fine",
        promptFile: "/tmp/it's-fine/prompt.txt",
        strategy: "none",
      }),
    );

    expect(out).toContain(String.raw`cd '/work/it'\''s-fine'`);
    expect(out).toContain(String.raw`_p=$(cat '/tmp/it'\''s-fine/prompt.txt')`);
  });

  it("includes a non-zero setup-status warning in the none strategy", () => {
    const out = buildLaunchCommand(arguments_({ strategy: "none" }));

    expect(out).toContain("setup_status=$?");
    expect(out).toContain("groundcrew setup command exited with status $setup_status");
  });

  describe("secretsFile (build-time secret shuttling)", () => {
    it("omits source/unset lines on the host strategy when secretsFile is undefined", () => {
      const out = buildLaunchCommand(arguments_({ strategy: "none" }));

      expect(out).not.toContain("secrets.env");
      expect(out).not.toContain("unset NPM_TOKEN");
      expect(out).not.toContain("unset BUF_TOKEN");
    });

    it("sources secretsFile before setup and unset the names before exec on the none strategy", () => {
      const out = buildLaunchCommand(
        arguments_({ strategy: "none", secretsFile: "/tmp/prompt-team-1/secrets.env" }),
      );

      const sourceIndex = out.indexOf(". '/tmp/prompt-team-1/secrets.env'");
      const setupIndex = out.indexOf("setup_status=$?");
      const unsetIndex = out.indexOf("unset NPM_TOKEN BUF_TOKEN");
      const execIndex = out.indexOf("exec claude");
      expect(sourceIndex).toBeGreaterThan(-1);
      expect(setupIndex).toBeGreaterThan(sourceIndex);
      expect(unsetIndex).toBeGreaterThan(setupIndex);
      expect(execIndex).toBeGreaterThan(unsetIndex);
      expect(out).toContain(
        "if [ -f '/tmp/prompt-team-1/secrets.env' ]; then set -a && . '/tmp/prompt-team-1/secrets.env' && set +a; fi",
      );
    });

    it("also sources and unset secrets on the safehouse strategy", () => {
      const out = buildLaunchCommand(
        arguments_({ strategy: "safehouse", secretsFile: "/tmp/prompt-team-1/secrets.env" }),
      );

      expect(out).toContain(". '/tmp/prompt-team-1/secrets.env'");
      expect(out).toContain("unset NPM_TOKEN BUF_TOKEN");
      expect(out).toMatch(/safehouse-clearance' claude "\$_p"$/);
    });

    it("docker strategy: host-side source, sbx -e env passthrough, inner unset before agent exec", () => {
      const out = buildLaunchCommand(
        arguments_({
          definition: {
            cmd: "claude",
            color: "#fff",
            isolation: "docker",
            sandbox: { agent: "claude" },
          },
          sandboxName: "groundcrew-repo-a-claude",
          strategy: "docker",
          secretsFile: "/tmp/prompt-team-1/secrets.env",
        }),
      );

      expect(out).toContain(". '/tmp/prompt-team-1/secrets.env'");
      expect(out).toContain("-e NPM_TOKEN -e BUF_TOKEN");
      // Passthrough form — no embedded values that could break on a quote in the token.
      expect(out).not.toContain('-e NPM_TOKEN="$');
      // The unset must live inside the inner sh -lc so the values exist
      // for the setup step but are gone before exec replaces the shell
      // with the agent.
      expect(out).toMatch(/setup_status=\$\?[^']*unset NPM_TOKEN BUF_TOKEN[^']*exec claude/);
    });

    it("docker strategy without secretsFile leaves the sbx invocation flag-free", () => {
      const out = buildLaunchCommand(
        arguments_({
          definition: {
            cmd: "claude",
            color: "#fff",
            isolation: "docker",
            sandbox: { agent: "claude" },
          },
          sandboxName: "groundcrew-repo-a-claude",
          strategy: "docker",
        }),
      );

      expect(out).not.toContain("-e NPM_TOKEN");
      expect(out).not.toContain("-e BUF_TOKEN");
      expect(out).not.toContain("unset NPM_TOKEN");
      expect(out).toContain(
        "exec sbx exec -it -w '/work/repo-a-team-1' 'groundcrew-repo-a-claude' sh -lc",
      );
    });
  });
});

describe(buildSpriteLaunchCommand, () => {
  it("keeps the host command on one physical line for cmux", () => {
    const out = buildSpriteLaunchCommand(spriteArguments());

    expect(out).not.toContain("\n");
  });

  it("uploads the prompt, runs in the remote worktree, and execs the agent with the prompt", () => {
    const out = buildSpriteLaunchCommand(spriteArguments());
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
    const out = buildSpriteLaunchCommand(
      spriteArguments({
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

  it("substitutes {{sandbox}} with an empty value for the Sprite runner", () => {
    const out = buildSpriteLaunchCommand(
      spriteArguments({
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
