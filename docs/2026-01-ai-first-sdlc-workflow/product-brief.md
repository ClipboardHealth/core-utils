# AI-First Software Development Lifecycle

## Context

AI moves the bottleneck from writing code to specifying intent and verifying quality.

We’ll experiment with candidate workflows, measure impact, and graduate what works into the Golden Path.

## Metrics

- DORA metrics (lead time to prod, deployment frequency, change failure rate, mean time to recovery).
- Pull request cycle time (open → merge) and review latency.
- Delegation rate: % of PRs with meaningful agent-authored diffs.
- Agent usefulness: Acceptance rate of agent suggestions and PRs.
- Quality guardrails:
  - Random merged-pull request audits.
  - Incident rate should not regress (lagging).
- Continuous integration pass rate (better local verification should drive this up).
- Pull request iterations (better ai-rules should drive this down).

## Workflow

### Perform product discovery and write brief

Product Managers work with agents to pull data, discover problems, brainstorm solutions, and draft Product Briefs with clear success criteria (e.g., Gherkin, contract tests) and an attached evidence bundle (e.g., queries, cited sources).

### Write technical design

Engineers work with agents to draft a technical design that is informed by code and data exploration, explicitly specifying:

1. Strongly-typed contract boundaries (e.g., between microservices/modules) and error semantics.
2. A rollout and rollback plan.
3. A verification spec to prove we met success criteria.

Upon human approval, the design is committed as Markdown to the appropriate repository/repositories. The design document in the repo is the single source of truth; we link to it from Linear for tracking and discussion.

Agents can propose edits as development learns new facts, but changes remain reviewable via source control.

### Write tickets

Product and engineering work with agents to draft small tickets based on the technical design, clearly designating:

- Order of operations.
- What can be worked on in parallel vs. serially.

Tickets live in Markdown in repos (their single source of truth) with links from Linear for tracking.

The highest priority tickets are the interfaces/contracts. Committing them early allows frontend and backend agents to work simultaneously.

Each parallel group of agents works in separate environments (e.g. git worktrees, containers, cloud environments).

### Write code

Specialized agents implement the tickets. The separation of concerns reduces agents validating their own hallucinations and allowing requirement drift. Agents:

- coder: Implements the code with test-driven development.
  - Red: Writes a test and verifies that it fails (red).
  - Green: Writes minimal implementation to get tests passing.
  - Refactor: Cleans up implementation and/or tests using a code-simplifier agent, verifying tests remain passing.
  - Commit changes to source control.
  - Repeat: Write the next failing test.
- product-manager: If coder cannot match the spec, they delegate to this agent; coder agents cannot edit the spec or interfaces themselves.

When feature complete, the following agents run:

- code-verifier: Type check, lint, and run tests.
- critic: Runs negative and edge case tests to try to break the code.
- code-reviewer: Reviews the code locally, passing findings to the coder agent to resolve.

### Review code

An agent opens a pull request. If changes are larger than originally planned, agents may open multiple stacked pull requests to ease reviews.

Cloud code review agents run (e.g., CodeRabbit) and coder agents address their feedback and any continuous integration check failures.

An agent deploys to a development environment and validates the change, uploading an evidence bundle (e.g., before and after screenshots, logs) to the pull request.

A human is the final gate and bottleneck: we’re reviewing thousands of lines of agent-generated code daily. We’re guided by:

1. The evidence bundle.
2. The pull request description, which includes:
    1. A detailed summary of the changes with links to the appropriate technical design section and ticket.
    2. A risk-weighted complexity score.
    3. Particular focus areas, including any technical design or ticket changes.

Humans course-correct as needed.

### Deploy

After human approval, agents merge the pull request, monitor the deployment for issues, and follow the rollout and rollback plans (e.g., toggle feature flags, roll back on error spikes).

Production-affecting actions default to “propose and request approval” until we explicitly graduate more autonomy.

### Notes

- We’ll create evals (possibly using [https://github.com/promptfoo/promptfoo](https://github.com/promptfoo/promptfoo)) for the workflow and its prompts to verify the model behaviors match our intent. See [https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents).
- Repo structure:
  - `docs/YYYY-MM-<feature>/`
    - `product-brief.md`
    - `technical-design.md`
    - `NN-<ticket>.md`
