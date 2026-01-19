# Document Templates

## Product Brief Template

````markdown
# [Feature Name]

## Problem Statement

[Clear description of the problem being solved]

## Context

[Background information, data, user research]

## Success Criteria

### Functional Requirements

```gherkin
Feature: [Feature name]

  Scenario: [Scenario name]
    Given [precondition]
    When [action]
    Then [expected result]
```
````

### Non-Functional Requirements

- Performance: [targets]
- Reliability: [targets]
- Security: [requirements]

## Scope

### In Scope

- [Item 1]
- [Item 2]

### Out of Scope

- [Item 1]
- [Item 2]

## Evidence Bundle

### Data Sources

- [Query/source 1]
- [Query/source 2]

### User Research

- [Citation 1]
- [Citation 2]

## Open Questions

- [ ] [Question 1]
- [ ] [Question 2]

````

## Technical Design Template

```markdown
# Technical Design: [Feature Name]

**Status:** Draft | In Review | Approved
**Author:** [Name]
**Reviewers:** [Names]
**Last Updated:** [Date]

## Overview

[Brief description of the technical approach]

## Contract Boundaries

### Service A → Service B

```typescript
interface RequestPayload {
  // Strongly-typed request
}

interface ResponsePayload {
  // Strongly-typed response
}

// Error semantics
type ServiceError =
  | { code: "NOT_FOUND"; message: string }
  | { code: "VALIDATION_ERROR"; errors: ValidationError[] }
  | { code: "INTERNAL_ERROR"; correlationId: string };
````

### Module A → Module B

[Define internal contracts similarly]

## Error Semantics

### Transient Errors (Retry)

- Network timeouts
- Rate limiting (429)
- Service unavailable (503)

### Permanent Errors (Don't Retry)

- Validation errors (400)
- Not found (404)
- Unauthorized (401)

### Error Handling Strategy

[Describe retry logic, circuit breakers, fallbacks]

## Rollout Plan

### Phase 1: Internal Testing

- Deploy to staging
- Internal team testing
- Duration: [X days]

### Phase 2: Canary

- 5% of traffic
- Monitor error rates
- Duration: [X days]

### Phase 3: Gradual Rollout

- 25% → 50% → 75% → 100%
- Each phase: [X days]

### Feature Flags

- `YYYY-MM-release-feature-name`: Main feature toggle
- `YYYY-MM-enable-fallback`: Kill switch for rollback

## Rollback Plan

### Triggers

- Error rate > [X]%
- P50 latency > [X]ms
- Critical bug discovered

### Steps

1. Disable feature flag
2. [Additional steps]
3. Notify stakeholders

### Data Migration Rollback

[If applicable, describe data migration reversal]

## Verification Spec

### Automated Verification

- [ ] Unit tests covering [scenarios]
- [ ] Integration tests for [contracts]
- [ ] E2E tests for [user flows]

### Manual Verification

- [ ] [Manual check 1]
- [ ] [Manual check 2]

### Metrics to Monitor

- [Metric 1]: baseline [X], target [Y]
- [Metric 2]: baseline [X], target [Y]

## Architecture Diagram

[Include relevant diagrams]

## Security Considerations

- [Consideration 1]
- [Consideration 2]

## Dependencies

- [Dependency 1]: [Status]
- [Dependency 2]: [Status]

## Timeline

| Phase          | Description         | Duration |
| -------------- | ------------------- | -------- |
| Design         | This document       | [X days] |
| Implementation | Tickets 01-05       | [X days] |
| Testing        | QA and verification | [X days] |
| Rollout        | Gradual deployment  | [X days] |

## Open Questions

- [ ] [Question 1]
- [ ] [Question 2]

````

## Ticket Template

```markdown
# [NN]-[ticket-slug]

**Type:** Interface | Backend | Frontend | Infrastructure | Testing
**Depends On:** [ticket numbers or "None"]
**Blocks:** [ticket numbers or "None"]
**Parallel Group:** [A, B, C, etc. for tickets that can run in parallel]

## Description

[Clear description of what needs to be implemented]

## Acceptance Criteria

- [ ] [Criterion 1]
- [ ] [Criterion 2]
- [ ] [Criterion 3]

## Technical Notes

[Implementation hints, relevant code locations, patterns to follow]

## Test Requirements

### Unit Tests

- [ ] [Test case 1]
- [ ] [Test case 2]

### Integration Tests

- [ ] [Test case 1]

## Definition of Done

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Code reviewed locally
- [ ] Documentation updated
````

## Evidence Bundle Structure

```markdown
# Evidence Bundle: [Feature/PR Name]

## Before State

### Screenshots

![Before screenshot](./evidence/before-1.png)
_Description of before state_

### Metrics

- Error rate: [X]%
- P50 latency: [X]ms
- Active users: [X]

## After State

### Screenshots

![After screenshot](./evidence/after-1.png)
_Description of after state_

### Metrics

- Error rate: [X]%
- P50 latency: [X]ms
- Active users: [X]

## Test Results

### Unit Tests
```

Tests: XX passed, XX total
Coverage: XX%

```

### Integration Tests

```

Tests: XX passed, XX total

```

### E2E Tests

```

Tests: XX passed, XX total

```

## Logs

### Relevant Log Excerpts

```

[Timestamp] [Level] [Message]

```

## Verification Checklist

- [ ] Success criteria from brief verified
- [ ] All tests passing
- [ ] No regressions in monitoring
- [ ] Manual verification complete
```
