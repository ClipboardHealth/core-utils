# SDLC Metrics & Quality Guardrails

## DORA Metrics

### Lead Time to Production

**Definition:** Time from code commit to running in production

**Targets:**

- Elite: < 1 hour
- High: < 1 day
- Medium: < 1 week
- Low: > 1 month

**Measurement:**

- Track commit timestamp
- Track deployment timestamp
- Calculate delta

### Deployment Frequency

**Definition:** How often code is deployed to production

**Targets:**

- Elite: Multiple times per day
- High: Once per day to once per week
- Medium: Once per week to once per month
- Low: Less than once per month

**Measurement:**

- Count production deployments per time period
- Track by team/service

### Change Failure Rate

**Definition:** Percentage of deployments causing failures requiring remediation

**Targets:**

- Elite: 0-15%
- High: 16-30%
- Medium: 31-45%
- Low: > 45%

**Measurement:**

- Track deployments requiring rollback
- Track deployments requiring hotfix
- Calculate percentage

### Mean Time to Recovery (MTTR)

**Definition:** Time to restore service after a failure

**Targets:**

- Elite: < 1 hour
- High: < 1 day
- Medium: < 1 week
- Low: > 1 month

**Measurement:**

- Track incident start time
- Track resolution time
- Calculate delta

## Pull Request Metrics

### PR Cycle Time

**Definition:** Time from PR open to merge

**Targets:**

- Excellent: < 4 hours
- Good: < 1 day
- Acceptable: < 3 days
- Needs improvement: > 3 days

**Breakdown:**

- Time to first review
- Review iteration time
- Time from approval to merge

### Review Latency

**Definition:** Time for first meaningful review comment

**Targets:**

- Excellent: < 2 hours
- Good: < 4 hours
- Acceptable: < 1 day
- Needs improvement: > 1 day

### PR Size

**Targets:**

- Optimal: < 200 lines changed
- Acceptable: < 400 lines changed
- Large: > 400 lines changed (consider splitting)

## Agent Metrics

### Delegation Rate

**Definition:** Percentage of PRs with meaningful agent-authored diffs

**Tracking:**

- Count PRs with agent commits
- Measure percentage of total code changes
- Track by feature type

### Agent Usefulness

**Definition:** Acceptance rate of agent suggestions and PRs

**Tracking:**

- Suggestions accepted vs. rejected
- PR approval rate without major revisions
- User satisfaction scores

### Agent Accuracy

**Definition:** Quality of agent-generated code

**Tracking:**

- Test coverage of agent code
- Bug rate in agent-generated code
- Review feedback severity

## Quality Guardrails

### Automated Checks

**Required for all PRs:**

- [ ] Type checking passes
- [ ] Linting passes
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Coverage threshold met (>80%)

**Required for production deploys:**

- [ ] E2E tests pass
- [ ] Security scan passes
- [ ] Performance benchmarks pass

### Manual Checks

**PR Review Focus Areas:**

1. Does the code match the technical design?
2. Are edge cases handled?
3. Is error handling appropriate?
4. Are tests meaningful (not just coverage)?
5. Is the code maintainable?

### Audit Process

**Random merged PR audits:**

- Weekly sampling of merged PRs
- Check for:
  - Adherence to design
  - Test quality
  - Security considerations
  - Documentation completeness

**Audit questions:**

1. Would this code pass a fresh review?
2. Are there gaps between design and implementation?
3. Were shortcuts taken that create tech debt?

### Incident Tracking

**Track for regression prevention:**

- Incident cause (code, config, infra)
- Time to detect
- Time to resolve
- Root cause analysis
- Preventive measures added

**Lagging indicators to monitor:**

- Incident rate (should not regress)
- Severity distribution
- Repeat incidents (same root cause)

## CI Pass Rate

**Definition:** Percentage of CI runs that pass

**Target:** > 95%

**Improvement strategies:**

- Better local verification before push
- Improved ai-rules for consistent code
- Flaky test identification and fixing

## Tracking Dashboard

### Recommended Metrics Display

```text
┌─────────────────────────────────────────────────────┐
│                   DORA Metrics                      │
├─────────────────────────────────────────────────────┤
│ Lead Time: [X hours]   Deployment Freq: [X/day]    │
│ Change Failure: [X%]   MTTR: [X hours]             │
├─────────────────────────────────────────────────────┤
│                   PR Metrics                        │
├─────────────────────────────────────────────────────┤
│ Cycle Time: [X hours]  Review Latency: [X hours]   │
│ Avg Size: [X lines]    Open PRs: [X]               │
├─────────────────────────────────────────────────────┤
│                  Agent Metrics                      │
├─────────────────────────────────────────────────────┤
│ Delegation Rate: [X%]  Acceptance Rate: [X%]       │
│ Agent PRs: [X/week]    Agent Coverage: [X%]        │
├─────────────────────────────────────────────────────┤
│                 Quality Guardrails                  │
├─────────────────────────────────────────────────────┤
│ CI Pass Rate: [X%]     Test Coverage: [X%]         │
│ Incidents: [X/week]    Audit Score: [X/10]         │
└─────────────────────────────────────────────────────┘
```

## Improvement Strategies

### Reducing Lead Time

1. Smaller PRs
2. Faster review cycles
3. Automated testing gates
4. Feature flags for incremental deployment

### Improving Delegation Rate

1. Better ai-rules for agent guidance
2. Clear technical designs
3. Well-structured tickets
4. Explicit success criteria

### Reducing Change Failure Rate

1. Comprehensive test coverage
2. Staged rollouts
3. Feature flags
4. Better pre-merge validation

### Improving CI Pass Rate

1. Run tests locally before push
2. Fix flaky tests immediately
3. Improve ai-rules for consistent code
4. Better pre-commit hooks
