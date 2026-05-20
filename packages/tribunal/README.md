# Tribunal CLI

`tribunal` gets a structured second opinion from advocate, skeptic, and analyst
LLM perspectives, then synthesizes the result with a deliberator model.

Run with environment variables already present:

```bash
npm --workspace @clipboard-health/tribunal run dev -- "Should we migrate?" --verbose
```

`--verbose` writes progress to stderr, including per-role start, finish, and
failure lines, plus a dot every five seconds while model calls are in flight.

Each run writes durable intermediate snapshots to
`.tribunal/runs/<timestamp>.json` by default. The file is updated as each role
starts, finishes, or fails, so completed perspective outputs are preserved even
when a later model call fails. Use `--save-intermediates <path>` to choose a
specific file, or `--no-save-intermediates` to disable snapshots.

Override model reasoning or thinking levels per role:

```bash
npm --workspace @clipboard-health/tribunal run dev -- "Should we migrate?" \
  --model advocate=anthropic:claude-opus-4-7 \
  --model skeptic=openai:gpt-5.5-pro \
  --model analyst=google:gemini-3.1-pro-preview \
  --deliberator openai:gpt-5.5-pro \
  --reasoning advocate=max \
  --reasoning skeptic=xhigh \
  --reasoning analyst=high \
  --reasoning deliberator=xhigh
```

Reasoning levels are mapped to each provider's AI SDK options. OpenAI supports
`none`, `minimal`, `low`, `medium`, `high`, and `xhigh`; Google supports
`minimal`, `low`, `medium`, and `high`; Anthropic supports `low`, `medium`,
`high`, `xhigh`, and `max`.

Run through 1Password without writing secret values to disk:

```bash
ANTHROPIC_API_KEY="op://<vault>/ANTHROPIC_API_KEY/<field>" \
OPENAI_API_KEY="op://<vault>/OPENAI_API_KEY/<field>" \
GOOGLE_GENERATIVE_AI_API_KEY="op://<vault>/GOOGLE_GENERATIVE_AI_API_KEY/<field>" \
npm --workspace @clipboard-health/tribunal run dev:op -- "Should we migrate?"
```

The committed values are only 1Password secret references. `op run` resolves
them in the child process environment at runtime.
