# Evals

`node --run eval` runs the default rules eval suite.

Skill evals use one runner so new skills do not add new package scripts:

```bash
node --run eval:skill -- frontend-ui-verification --smoke
```

The smoke mode is deterministic and non-LLM. It uses a local fake provider to verify that Promptfoo loads the config, executes every scenario, passes `metadata.skillCalls` into `skill-used`, and runs the JavaScript workflow assertions.

```bash
node --run eval:skill -- frontend-ui-verification
```

The default skill run is manual and LLM-backed. For frontend UI verification it runs Claude and Codex by default. Narrow the provider set while debugging:

```bash
FRONTEND_UI_VERIFICATION_EVAL_PROVIDERS=codex node --run eval:skill -- frontend-ui-verification -- --filter-first-n 1
```

Claude runs require `ANTHROPIC_API_KEY`. Codex runs require the local Codex auth path used by Promptfoo's Codex adapter.

When adding another skill eval, add the Promptfoo config and one entry in `scripts/runSkillEval.mts`; do not add another package script.
