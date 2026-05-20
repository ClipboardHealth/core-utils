# Tribunal CLI

`tribunal` gets a structured second opinion from advocate, skeptic, and analyst
LLM perspectives, then synthesizes the result with a deliberator model.

Run with API key environment variables already present:

```bash
npm --workspace @clipboard-health/tribunal run dev -- "Should we migrate?" --verbose
```

For local defaults, copy the checked-in example to a gitignored root config:

```bash
cp tribunal.config.example.json tribunal.config.json
```

The CLI searches for `tribunal.config.json` from the current working directory
upward. Config values are defaults only; explicit CLI flags still take
precedence.

```json
{
  "apiKeys": {
    "anthropic": "op://Private/ANTHROPIC_API_KEY/credential",
    "googleGenerativeAi": "op://Private/GOOGLE_GENERATIVE_AI_API_KEY/credential",
    "openai": "op://Private/OPENAI_API_KEY/credential"
  },
  "models": {
    "advocate": "anthropic:claude-opus-4-7",
    "skeptic": "openai:gpt-5.5",
    "analyst": "google:gemini-3.1-pro-preview",
    "deliberator": "openai:gpt-5.5"
  },
  "reasoning": {
    "advocate": "max",
    "skeptic": "xhigh",
    "analyst": "high",
    "deliberator": "xhigh"
  },
  "outputFormat": "text",
  "showPerspectives": false,
  "saveIntermediates": true
}
```

`--verbose` writes progress to stderr, including per-role start, finish, and
failure lines, plus a dot every five seconds while model calls are in flight.

Each run writes durable intermediate snapshots to
`.tribunal/runs/<timestamp>.json` by default. The file is updated as each role
starts, finishes, or fails, so completed perspective outputs are preserved even
when a later model call fails. Use `--save-intermediates <path>` to choose a
specific file, or `--no-save-intermediates` to disable snapshots.

After a successful run, an HTML report is written to
`.tribunal/reports/<timestamp>.html` and opened in your default browser. The
report shows the deliberator's verdict, recommendation, and confidence at the
top, with each perspective (advocate, skeptic, analyst) as a collapsible
accordion below. Override the path with `--html <path>`, skip opening with
`--no-open`, or disable the report entirely with `--no-html`.

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
npm --workspace @clipboard-health/tribunal run dev:op -- "Should we migrate?"
```

When `apiKeys` are present in `tribunal.config.json`, `tribunal-op` passes those
1Password references to `op run`, which resolves them in the child process
environment at runtime.
