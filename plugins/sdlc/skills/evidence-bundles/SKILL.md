---
name: Evidence Bundles
description: This skill should be used when the user asks about "evidence bundle", "PR evidence", "before/after screenshots", "deployment verification", "test results documentation", "proof of change", or mentions collecting evidence for pull requests. Provides guidance on creating verification evidence for code reviews.
version: 0.1.0
---

# Evidence Bundles

## Overview

Evidence bundles are collections of artifacts that prove a change works as intended. They accompany pull requests to help reviewers verify changes quickly and confidently. This is especially important when reviewing agent-generated code.

## Bundle Components

### Required Components

1. **Test Results** - Output from test suite runs
2. **Screenshot/Visual Evidence** - Before and after states
3. **Log Excerpts** - Relevant log output demonstrating behavior

### Optional Components

- Metrics comparisons (performance, error rates)
- API response samples
- Database query results
- User flow recordings

## Creating Evidence

### Test Results

Capture comprehensive test output:

```bash
# Run tests with coverage
npm test -- --coverage 2>&1 | tee evidence/test-results.txt

# Or for specific test suites
npx nx run project:test:ci 2>&1 | tee evidence/test-results.txt
```

Include:

- Total tests run
- Pass/fail counts
- Coverage percentage
- Any warnings

### Screenshots

Capture before and after states:

```bash
# Using a screenshot utility
# Ensure consistent viewport/state
```

Naming convention:

- `before-[feature]-[view].png`
- `after-[feature]-[view].png`

Screenshot checklist:

- [ ] Same viewport size
- [ ] Same user state (logged in, same account)
- [ ] Clear labels or annotations
- [ ] Relevant UI elements visible

### Log Evidence

Extract relevant log entries:

```bash
# Filter logs for relevant entries
grep -A 5 "feature-flag" app.log > evidence/logs.txt

# Or from structured logs
jq 'select(.feature == "new-booking")' logs.json > evidence/logs.json
```

Include:

- Timestamp
- Log level
- Message
- Relevant context fields

## Bundle Structure

Organize evidence in the PR or a dedicated directory:

```
evidence/
├── README.md          # Summary and index
├── test-results.txt   # Test output
├── coverage/          # Coverage reports
├── screenshots/
│   ├── before-main-view.png
│   └── after-main-view.png
├── logs/
│   └── feature-logs.txt
└── metrics/
    └── performance-comparison.md
```

## PR Description Format

Include evidence in PR description:

```markdown
## Evidence Bundle

### Test Results

- Unit tests: ✅ 142 passed
- Integration tests: ✅ 28 passed
- Coverage: 87% (+2%)

### Visual Evidence

| Before                                       | After                                      |
| -------------------------------------------- | ------------------------------------------ |
| ![Before](./evidence/screenshots/before.png) | ![After](./evidence/screenshots/after.png) |

### Verification

- [x] Manual testing in staging
- [x] Error rates stable (0.1%)
- [x] P50 latency unchanged (42ms)

### Logs

Relevant log showing feature activation:
```

2024-01-15 10:23:45 INFO [BookingService] Feature flag enabled for user_123
2024-01-15 10:23:46 INFO [BookingService] New booking flow completed successfully

```

```

## Automated Collection

### Using Scripts

Use the evidence collection script:

```bash
# Collect all evidence
npx tsx ${CLAUDE_PLUGIN_ROOT}/skills/evidence-bundles/scripts/collectEvidence.ts

# With options
npx tsx collectEvidence.ts --all --output ./pr-evidence
```

### CI Integration

Add to CI pipeline:

```yaml
- name: Collect Evidence
  run: |
    mkdir -p evidence
    npm test -- --coverage > evidence/test-results.txt 2>&1
    # Additional collection steps
```

## Best Practices

### Screenshot Quality

- Use consistent resolution (1920x1080 recommended)
- Capture full context, not just changed element
- Add annotations for non-obvious changes
- Include timestamps if relevant

### Log Selection

- Filter to relevant time window
- Remove sensitive information (tokens, PII)
- Include correlation IDs for tracing
- Show both success and handled error paths

### Metrics Comparison

Present metrics clearly:

```markdown
| Metric      | Before   | After    | Change |
| ----------- | -------- | -------- | ------ |
| P50 Latency | 42ms     | 41ms     | -2%    |
| P99 Latency | 180ms    | 175ms    | -3%    |
| Error Rate  | 0.12%    | 0.11%    | -8%    |
| Throughput  | 1000 rps | 1050 rps | +5%    |
```

### Evidence Completeness

Checklist before submitting:

- [ ] All acceptance criteria have evidence
- [ ] Before/after comparison included
- [ ] Test results complete
- [ ] No sensitive data in screenshots/logs
- [ ] Evidence matches PR description claims

## Additional Resources

### Scripts

Utility scripts in `scripts/`:

- **`collectEvidence.ts`** - Automated evidence collection
