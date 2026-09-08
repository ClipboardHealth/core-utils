# Pullfrog review policy

The workflow installs the complete `cb-review` skill from a pinned commit of `ClipboardHealth/skills-private`. Pullfrog uses its `--pullfrog` mode, which shares review policy, rubric, and evidence standards with the normal skill. Pullfrog continues to own checkout, specialist dispatch, incremental scope, and review submission.

Update `PRIVATE_SKILLS_COMMIT` in the workflow when adopting a new skill revision. Install failures stop the run. The preparation log records the commit and file count without printing private file contents; the activation log records the trusted absolute path.

## Trust boundaries

The GitHub App token can read only `skills-private`. The fetcher requests the `cb-review` Git subtree and its blobs, verifies blob hashes, and rejects incomplete responses and unsupported Git entries. Other private skill bodies are not downloaded. The workflow revokes the token immediately after fetching. The token action also retains its automatic cleanup as a fallback; it may warn that the already-revoked token is invalid.

Vercel's installer runs in a container with the source mounted read-only and one writable output directory. The container receives no host credentials, process namespace, workspace, or Docker socket. This matters because the surrounding Pullfrog job has OIDC permission. The output must match the complete source manifest before it is used.

The installer still has outbound network access to download its npm package and dependencies. A compromised installer could upload the private skill contents; a read-only mount and matching output hashes do not prevent that. This design trusts the pinned installer with the skill's confidentiality. Use only non-secret instruction content; an offline, pre-fetched installer would be a separate hardening step.

The pinned [Vercel Skills CLI](https://github.com/vercel-labs/skills) is MIT-licensed and maintained by Vercel Labs. It is an ephemeral installer, not an application dependency; it adds no application bundle weight. The container bounds the impact of installer or dependency compromise, and the source comparison checks what it copied.

The skill and OpenCode configuration live outside the checkout under `/tmp`, which Pullfrog permits its native readers to access. Pullfrog changes its agent's home directory, so a global install into the runner's home is insufficient. An absolute instruction path reaches the root agent and specialists and survives PR checkout. The activation instruction selects the trusted path even if a PR contains another skill named `cb-review`.

The workflow pins OpenCode as the Pullfrog harness. A harness change needs equivalent trusted instruction loading and a fresh live validation. Project-controlled OpenCode configuration and `.opencode` plugins, agents, and commands are disabled for this workflow, including its non-review modes. This also disables OpenCode's automatic root-level `AGENTS.md`/`CLAUDE.md` injection; Pullfrog's own instructions and the shared conventions rubric still require reading applicable repository rules. Nested instruction files may still accompany native file reads. The managed `inputs.prompt` passes through unchanged. No Pullfrog console changes or setup hooks are needed.

Before launching the agent, the workflow makes the complete prepared tree root-owned and non-writable. `OPENCODE_CONFIG` points to the protected config file; unlike a custom config directory, that path does not require OpenCode to bootstrap dependencies inside the protected tree. An unprivileged filesystem probe must confirm that reads work and policy mutations fail before review can start. This protects against native agent file operations, not an actor with host root privileges.

The pinned Pullfrog shell's [`sudo-unshare` path](https://github.com/pullfrog/pullfrog/blob/22442cbbe9039fe186e20f1fdf9206bb4a07e7cd/mcp/shell.ts#L372) drops back to the runner account without blocking later privilege elevation. On a runner with passwordless sudo, a shell command can regain root and bypass file ownership; the policy directory is not part of its protected mount overlays. Closing that path requires upstream shell-sandbox hardening. The post-run verifier remains detection after execution, not a guarantee that every possible agent execution path used unchanged policy.

The post-run step checks the copied verifier against its pre-run digest, then checks the original manifest digest, complete installed skill, activation instruction, and configuration. The digests remain in GitHub Actions step outputs, outside the agent's writable files. No private skill artifact is uploaded. Skills are instructions, not a place to store secrets; a review agent may quote their content in logs or findings.

## Container registry exception

The installer uses the official Node image from ECR Public at an immutable linux/amd64 digest. This integration makes one unauthenticated image pull per run because the workflow has no AWS identity. Provisioning AWS authentication is outside this change. This bounded exception to the CI authentication rule retains ECR Public as the registry; its unauthenticated quota can still cause a pull failure.

## Validation

Run `node --test .github/pullfrog/*.test.mjs` and `actionlint .github/workflows/pullfrog.yml .github/workflows/ci.yml`. The installer tests execute the public CLI with real temporary files and mocked GitHub and Docker boundaries. Normal CI runs them as well. The filesystem-protection regression requires a disposable Linux container running as root: it prepares a public fixture and runs the probe as UID/GID 1000. It explicitly skips on non-root or non-Linux hosts; the live workflow always runs the unprivileged probe against the actual installed policy.

Run `OPENCODE_DISABLE_PROJECT_CONFIG=true node .github/pullfrog/openCodeConfigProbe.mjs /absolute/path/to/opencode` with the pinned OpenCode 1.18.5 binary in an isolated container. This opt-in smoke test uses public fixtures and exercises the actual config/plugin loader without model credentials. Its control enables project configuration; the protected case must retain the trusted instructions and global gate plugin while excluding project configuration and plugins.

Before enabling a changed integration, dispatch the branch's workflow with an unwrapped prompt to review its actual implementation PR. This exercises the skill in Pullfrog's real `Review` mode and posts a review on that PR. Inspect the run for the trusted activation path and shared-reference reads by the orchestrator and any specialists. Auto-reviews use the workflow on the default branch, so validate that path after the workflow lands.
