---
analytics: patch
background-jobs-adapter: patch
clearance: patch
config: patch
contract-core: patch
embedex: patch
eslint-config: patch
eslint-plugin: patch
execution-context: patch
json-api-nestjs: patch
json-api: patch
notifications: patch
nx-plugin: patch
oxlint-plugin: patch
phone-number: patch
playwright-flake-linter: patch
playwright-reporter-llm: patch
playwright-toolkit: patch
rules-engine: patch
testing-core: patch
usa-states: patch
util-ts: patch
---

Patch release after the tsrs change (#1024). `config` picks up dotenv 18.0.10. For the other packages, this release has no code changes: it moves each release tag past #1024, so later releases stop treating #1024's breaking change as theirs.
