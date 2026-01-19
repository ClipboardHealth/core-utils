---
description: Merge PR and monitor deployment with rollout management
argument-hint: [pr-number or 'current PR']
allowed-tools: Read, Bash(*), Task, AskUserQuestion
---

# Deployment Management

Deploy: $ARGUMENTS

## Prerequisites

Before deployment, verify:

- PR approved by human reviewer
- All CI checks passing
- Evidence bundle complete
- Rollout plan in technical design

## Process

1. **Confirm approval**
   - Verify PR has human approval
   - Check all CI checks green
   - Confirm ready for merge

2. **Merge the PR**
   - Use squash merge for clean history
   - Include PR number in commit message
   - Delete branch after merge

3. **Monitor deployment**

   Use the deployment-monitor agent to:

   **Track metrics during rollout**
   - Error rates
   - Latency percentiles (P50, P99)
   - Throughput
   - Custom business metrics

   **Compare to baselines**
   - Error rate should not increase
   - Latency should not degrade
   - No new error types appearing

4. **Follow rollout plan**

   Execute the rollout plan from technical design:

   **Gradual rollout example**:
   - Phase 1: 5% traffic (canary)
   - Phase 2: 25% traffic
   - Phase 3: 50% traffic
   - Phase 4: 100% traffic

   **Feature flag management**:
   - Enable flag gradually
   - Monitor between phases
   - Wait for stability before progressing

5. **Handle issues**

   If issues detected:

   **Propose rollback** (requires human approval):
   - Describe issue observed
   - Compare metrics to baseline
   - Recommend rollback action
   - Wait for human approval
   - Execute rollback if approved

   **Rollback actions**:
   - Disable feature flag
   - Revert deployment if needed
   - Notify stakeholders
   - Create incident ticket

6. **Confirm successful deployment**
   - All phases complete
   - Metrics stable
   - No rollback needed
   - Update ticket and documentation

## Rollback Triggers

The deployment-monitor agent proposes rollback when metrics exceed thresholds:

- Error rate, latency, or critical errors
- See deployment-monitor agent for detailed thresholds

## Output

- PR merged
- Deployment monitored
- Rollout phases executed
- Issues escalated appropriately

## Important

- Production-affecting actions require human approval
- "Propose and request approval" is the default
- Never auto-rollback without approval
- Document all deployment decisions

## Next Steps

After successful deployment:

- Update Linear ticket to Done
- Clean up feature flag (schedule archival)
- Update documentation if needed
- Conduct retrospective if issues occurred

Use the sdlc-workflow skill for rollout plan guidance.
