# Product Brief: SDLC Productivity Metrics Baseline

**Author:** Engineering Leadership
**Status:** Draft
**Created:** 2026-01-19
**Last Updated:** 2026-01-19

---

## 1. Problem Statement

Engineering leadership lacks visibility into how effectively the AI-first SDLC workflow improves development productivity. Without baseline metrics and ongoing measurement, we cannot:

- Quantify the impact of AI-assisted development on team velocity
- Identify bottlenecks in the development lifecycle
- Make data-driven decisions about tooling investments
- Demonstrate ROI of the SDLC plugin adoption

## 2. Context

### Background

The organization has adopted an AI-first software development lifecycle (SDLC) workflow, including the SDLC plugin for Claude Code. While anecdotal feedback suggests productivity improvements, we have no quantitative data to validate these claims or guide further optimization.

### Research and Industry Standards

The DORA (DevOps Research and Assessment) metrics provide an industry-standard framework for measuring software delivery performance:

- **Lead Time to Production:** Time from code commit to production deployment
- **Deployment Frequency:** How often code is deployed to production
- **Change Failure Rate:** Percentage of deployments causing failures
- **Mean Time to Recovery (MTTR):** Time to restore service after an incident

Beyond DORA, AI-assisted development introduces new dimensions requiring measurement:

- Agent contribution rates and acceptance patterns
- Quality impact of AI-generated code
- Developer-agent collaboration efficiency

### Data Sources Available

| Source     | Data Available                                | Access Method  |
| ---------- | --------------------------------------------- | -------------- |
| GitHub/Git | PRs, commits, review times, merge frequency   | GitHub API     |
| Linear     | Tickets, cycle time, throughput               | Linear API     |
| CI/CD      | Build times, pass rates, deployment frequency | CI system APIs |

### Primary Users

- **Engineering Leadership:** Strategic decisions on tooling and process
- **Engineering Managers:** Team performance insights and coaching
- **Individual Contributors:** Self-improvement and workflow optimization

## 3. Success Criteria

### SC-1: Core DORA Metrics Collection

```gherkin
Feature: DORA Metrics Collection

Scenario: Collect lead time to production
  Given commits are merged to the main branch
  When the metrics collector runs
  Then it calculates the time from first commit to production deployment
  And stores the metric with timestamp and project context

Scenario: Collect deployment frequency
  Given deployments occur to production
  When the metrics collector runs for a given time period
  Then it counts the number of deployments
  And calculates deployments per day/week

Scenario: Track change failure rate
  Given deployments are tagged in the system
  And incidents are linked to deployments
  When the metrics collector runs
  Then it calculates the percentage of deployments causing incidents
```

### SC-2: Pull Request Metrics Collection

```gherkin
Feature: Pull Request Metrics

Scenario: Measure PR cycle time
  Given a pull request is opened
  When the pull request is merged
  Then the system records the time from open to merge
  And categorizes by PR size and type

Scenario: Measure review latency
  Given a pull request is opened
  When the first review is submitted
  Then the system records the time from open to first review

Scenario: Track PR iterations
  Given a pull request receives review feedback
  When additional commits are pushed
  Then the system counts the number of review cycles
```

### SC-3: Agent Contribution Metrics

```gherkin
Feature: Agent Contribution Tracking

Scenario: Calculate delegation rate
  Given pull requests are merged
  And commits contain agent co-author attribution
  When the metrics collector runs
  Then it calculates the percentage of PRs with agent-authored diffs
  And reports the delegation rate

Scenario: Track agent suggestion acceptance
  Given the agent proposes code changes
  When developers accept or reject suggestions
  Then the system records acceptance rate by category
```

### SC-4: Quality Guardrail Metrics

```gherkin
Feature: Quality Metrics

Scenario: Track CI pass rate
  Given CI pipelines run on pull requests
  When the metrics collector aggregates results
  Then it reports the first-run pass rate
  And the overall pass rate after retries

Scenario: Flag PRs for audit
  Given pull requests are merged
  When the weekly audit selection runs
  Then it randomly selects a configurable number of PRs
  And marks them for manual quality review
```

### SC-5: Reporting and Output

```gherkin
Feature: CLI Reporting

Scenario: Generate weekly metrics report
  Given metrics have been collected for the past week
  When the user runs the report generation command
  Then a formatted report is produced
  And includes all tracked metrics with week-over-week comparison

Scenario: Export metrics data
  Given metrics are stored in the system
  When the user requests a data export
  Then metrics are exported in CSV or JSON format
  And include all raw data points for the requested time range
```

## 4. Non-Functional Requirements

### Performance

- Metrics collection must complete within 5 minutes for a standard week of data
- Report generation must complete within 30 seconds
- System must handle repositories with up to 1000 PRs per week

### Security

- API tokens for GitHub and Linear must be stored securely (environment variables or secure credential store)
- No sensitive data (commit messages, PR descriptions) should be stored in metrics
- Reports should not expose individual developer performance without explicit opt-in

### Reliability

- Metrics collection should be idempotent (re-running produces same results)
- Failed collection runs should be resumable
- Data should be stored durably with backup capability

### Privacy

- Individual developer metrics should be aggregated by default
- Opt-in required for individual-level reporting
- Comply with any applicable data retention policies

## 5. Scope

### In Scope (MVP)

1. **Core Metrics (5 key metrics):**
   - Lead time to production (DORA)
   - PR cycle time (open to merge)
   - Delegation rate (% PRs with agent contribution)
   - CI first-run pass rate
   - PR iteration count

2. **Data Collection:**
   - GitHub API integration for PR and commit data
   - Linear API integration for ticket data
   - Local storage of metrics (JSON/SQLite)

3. **Reporting:**
   - CLI command to generate weekly report
   - Markdown output format
   - Week-over-week comparison

4. **Baseline Establishment:**
   - Initial 4-week baseline collection period
   - Baseline report with statistical summary

### Out of Scope (Future Phases)

- Web dashboard or GUI
- Real-time metrics streaming
- Full DORA metrics (deployment frequency, MTTR, change failure rate require additional infrastructure integration)
- Automated alerts and notifications
- Team-level comparisons and leaderboards
- Integration with other project management tools (Jira, Asana)
- Predictive analytics or ML-based insights
- Custom metric definitions
- Historical data import (beyond 90 days)

## 6. Evidence Bundle

### Data Sources

| Metric          | Primary Source | Calculation Method                                       |
| --------------- | -------------- | -------------------------------------------------------- |
| Lead time       | GitHub + CI    | Time from first commit to deployment tag                 |
| PR cycle time   | GitHub         | PR opened_at to merged_at                                |
| Review latency  | GitHub         | PR opened_at to first review submitted_at                |
| Delegation rate | GitHub         | Count of PRs with `Co-Authored-By: *Claude*` / Total PRs |
| CI pass rate    | GitHub Actions | Successful first runs / Total runs                       |
| PR iterations   | GitHub         | Count of review-then-push cycles                         |

### Industry Benchmarks (DORA 2024)

| Metric               | Elite     | High           | Medium           | Low       |
| -------------------- | --------- | -------------- | ---------------- | --------- |
| Lead time            | < 1 hour  | 1 day - 1 week | 1 week - 1 month | > 1 month |
| Deployment frequency | On-demand | Daily - Weekly | Weekly - Monthly | < Monthly |
| Change failure rate  | < 5%      | 5-10%          | 10-15%           | > 15%     |
| MTTR                 | < 1 hour  | < 1 day        | < 1 week         | > 1 week  |

### References

- [DORA State of DevOps Report](https://dora.dev)
- [GitHub API Documentation](https://docs.github.com/en/rest)
- [Linear API Documentation](https://developers.linear.app)

## 7. Open Questions

1. **Baseline Period:** Is 4 weeks sufficient for establishing a meaningful baseline, or should we extend to 8 weeks?

2. **Agent Attribution:** How do we reliably identify agent-authored code beyond the `Co-Authored-By` convention? Are there other markers we should track?

3. **Audit Process:** Who will perform the random merged-PR audits? What criteria should they evaluate?

4. **Deployment Tracking:** How are deployments currently tagged or tracked? Do we need to implement deployment markers first?

5. **Incident Correlation:** How do we link incidents to specific deployments for change failure rate calculation?

6. **Team Boundaries:** Should metrics be collected at the repository level, team level, or organization level?

7. **Privacy Considerations:** What level of anonymization is required for individual developer metrics?

8. **Comparison Groups:** Should we compare metrics across teams, or only track improvement over time for each team?

---

## Appendix A: Proposed CLI Commands

```bash
# Collect metrics for the past week
sdlc-metrics collect --period=week

# Generate weekly report
sdlc-metrics report --period=week --format=markdown

# Export raw data
sdlc-metrics export --start=2026-01-01 --end=2026-01-19 --format=json

# View baseline summary
sdlc-metrics baseline --show

# Flag PRs for audit
sdlc-metrics audit --select=5 --period=week
```

## Appendix B: Sample Report Structure

```markdown
# SDLC Productivity Metrics - Week of 2026-01-13

## Summary
- PRs Merged: 45 (+12% vs last week)
- Delegation Rate: 34% (+5% vs last week)
- CI Pass Rate: 87% (-2% vs last week)

## Detailed Metrics

### PR Cycle Time
- Median: 18 hours (last week: 22 hours)
- P90: 48 hours (last week: 52 hours)

### Agent Contribution
- PRs with agent diffs: 15/45 (33%)
- Agent suggestion acceptance: 78%

### Quality Indicators
- CI first-run pass rate: 87%
- Average PR iterations: 1.8

## Trends
[Week-over-week charts would go here]

## Audit Queue
- PR #1234: Selected for quality audit
- PR #1256: Selected for quality audit
```
