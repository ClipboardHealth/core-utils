---
description: Draft a technical design with contracts and rollout plans
argument-hint: [feature-name or 'based on brief']
allowed-tools: Read, Write, Edit, Grep, Glob, Bash(git:*), Task, AskUserQuestion
---

# Technical Design Creation

Create a technical design for: $ARGUMENTS

## Process

1. **Locate the product brief**
   - Find the relevant product brief in `docs/YYYY-MM-feature-name/`
   - Read and understand the problem and success criteria
   - If no brief exists, recommend running `/brief` first

2. **Explore the codebase**
   - Identify affected services/modules
   - Understand existing patterns and architecture
   - Find relevant code locations

3. **Design contract boundaries**
   - Define strongly-typed interfaces between services/modules
   - Specify request/response payloads
   - Document error semantics (transient vs permanent)
   - Define retry strategies

4. **Plan rollout strategy**
   - Phase 1: Internal testing (staging)
   - Phase 2: Canary deployment (5% traffic)
   - Phase 3: Gradual rollout (25% → 50% → 75% → 100%)
   - Feature flag naming: `YYYY-MM-release-feature-name`

5. **Plan rollback strategy**
   - Define rollback triggers (error rate, latency thresholds)
   - Document rollback steps
   - Handle data migration rollback if needed

6. **Create verification spec**
   - Map success criteria to tests
   - Define automated verification steps
   - List manual verification steps
   - Specify metrics to monitor

7. **Document architecture**
   - Create clear diagrams where helpful
   - Document security considerations
   - List dependencies and their status

## Output

Save to `docs/YYYY-MM-feature-name/technical-design.md` following the template in the sdlc-workflow skill.

## Important

- Design is committed to repo as single source of truth
- Link to design from Linear for tracking
- Agents can propose edits later via source control
- Human approval required before implementation

## Next Steps

After completing the design:

- Human reviews and approves
- Design is committed to repo
- Proceed to `/tickets` to break down into tasks
- Interface tickets should be prioritized first

Use the sdlc-workflow skill for document templates and workflow guidance.
