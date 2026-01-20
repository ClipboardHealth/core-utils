# Technical Design: SDLC Productivity Metrics CLI

**Status:** Draft
**Author:** Engineering
**Reviewers:** Engineering Leadership
**Last Updated:** 2026-01-19

---

## Overview

A CLI tool for collecting, storing, and reporting on SDLC productivity metrics. The tool integrates with GitHub via the `gh` CLI to collect PR and commit data, stores metrics locally in JSON files, and generates Markdown reports with week-over-week comparisons.

The implementation follows established patterns in this codebase:

- CLI framework: `@commander-js/extra-typings` (per `packages/embedex`)
- GitHub integration: `gh` CLI wrapper pattern (per `plugins/lib/ghClient.ts`)
- Error handling: `ServiceResult` pattern from `@clipboard-health/util-ts`
- Package structure: Standard Nx package layout with `src/lib/`, `src/bin/`

## Architecture

```text
+------------------+     +-------------------+     +------------------+
|                  |     |                   |     |                  |
|   CLI Commands   |---->|   Metric          |---->|   Storage        |
|   (Commander)    |     |   Collectors      |     |   (JSON Files)   |
|                  |     |                   |     |                  |
+------------------+     +-------------------+     +------------------+
        |                        |                        |
        v                        v                        v
+------------------+     +-------------------+     +------------------+
|                  |     |                   |     |                  |
|   Report         |<----|   GitHub API      |     |   .sdlc-metrics/ |
|   Generator      |     |   (gh GraphQL)    |     |   directory      |
|                  |     |                   |     |                  |
+------------------+     +-------------------+     +------------------+
```

### Component Responsibilities

| Component          | Responsibility                                          |
| ------------------ | ------------------------------------------------------- |
| CLI Commands       | Parse arguments, orchestrate collectors and reporters   |
| Metric Collectors  | Fetch data from GitHub, compute individual metrics      |
| Storage            | Persist and retrieve metric data as JSON files          |
| Report Generator   | Aggregate metrics, compute comparisons, format output   |
| GitHub Client      | Execute GraphQL queries via `gh api graphql`            |

### Data Flow

1. **Collection Flow:**
   - User runs `sdlc-metrics collect --period=week`
   - CLI determines date range from period
   - Collectors fetch PR and commit data from GitHub
   - Metrics are computed and stored in `.sdlc-metrics/data/YYYY-MM-DD.json`

2. **Report Flow:**
   - User runs `sdlc-metrics report --period=week`
   - Report generator loads current and previous period data
   - Week-over-week comparisons are computed
   - Markdown report is written to stdout or file

3. **Export Flow:**
   - User runs `sdlc-metrics export --start=DATE --end=DATE`
   - Storage layer retrieves all data in range
   - Data is output in requested format (JSON/CSV)

## Contract Boundaries

### CLI Options Interface

```typescript
interface CollectOptions {
  /** Time period to collect: "day" | "week" | "month" */
  readonly period: Period;
  /** Repository in owner/repo format, defaults to current repo */
  readonly repo?: string;
  /** Output directory, defaults to .sdlc-metrics */
  readonly output?: string;
  /** Enable verbose logging */
  readonly verbose?: boolean;
}

interface ReportOptions {
  /** Time period for report: "day" | "week" | "month" */
  readonly period: Period;
  /** Output format: "markdown" | "json" */
  readonly format: OutputFormat;
  /** Include comparison with previous period */
  readonly compare?: boolean;
  /** Output file path, defaults to stdout */
  readonly output?: string;
}

interface ExportOptions {
  /** Start date in YYYY-MM-DD format */
  readonly start: string;
  /** End date in YYYY-MM-DD format */
  readonly end: string;
  /** Output format: "json" | "csv" */
  readonly format: ExportFormat;
  /** Output file path, defaults to stdout */
  readonly output?: string;
}

interface AuditOptions {
  /** Number of PRs to select for audit */
  readonly select: number;
  /** Time period to select from: "week" | "month" */
  readonly period: Period;
}

interface BaselineOptions {
  /** Show baseline summary */
  readonly show: boolean;
}

type Period = "day" | "week" | "month";
type OutputFormat = "markdown" | "json";
type ExportFormat = "json" | "csv";
```

### Metric Data Types

```typescript
/** Individual PR metrics */
interface PullRequestMetrics {
  /** PR number */
  readonly number: number;
  /** PR title (for reference, not stored in reports) */
  readonly title: string;
  /** Time from PR open to merge in milliseconds */
  readonly cycleTimeMs: number;
  /** Time from PR open to first review in milliseconds */
  readonly timeToFirstReviewMs: number | undefined;
  /** Number of review cycles (review -> push cycles) */
  readonly iterationCount: number;
  /** Whether PR has agent co-author attribution */
  readonly hasAgentContribution: boolean;
  /** CI first-run pass/fail status */
  readonly ciFirstRunPassed: boolean | undefined;
  /** PR size category */
  readonly sizeCategory: "xs" | "s" | "m" | "l" | "xl";
  /** Merge timestamp */
  readonly mergedAt: string;
}

/** Lead time data point */
interface LeadTimeDataPoint {
  /** Commit SHA */
  readonly commitSha: string;
  /** Time from first commit to production deployment in milliseconds */
  readonly leadTimeMs: number;
  /** Deployment timestamp */
  readonly deployedAt: string;
}

/** Aggregated metrics for a time period */
interface PeriodMetrics {
  /** Period start date (YYYY-MM-DD) */
  readonly periodStart: string;
  /** Period end date (YYYY-MM-DD) */
  readonly periodEnd: string;
  /** Repository owner/name */
  readonly repository: string;
  /** Collection timestamp */
  readonly collectedAt: string;
  /** Summary statistics */
  readonly summary: MetricsSummary;
  /** Raw PR data for detailed analysis */
  readonly pullRequests: readonly PullRequestMetrics[];
  /** Lead time data points (if deployment data available) */
  readonly leadTimes: readonly LeadTimeDataPoint[];
}

interface MetricsSummary {
  /** Total PRs merged in period */
  readonly totalPrsMerged: number;
  /** Delegation rate: PRs with agent contribution / total PRs */
  readonly delegationRate: number;
  /** CI first-run pass rate */
  readonly ciFirstRunPassRate: number | undefined;
  /** PR cycle time statistics */
  readonly cycleTime: DurationStats;
  /** Time to first review statistics */
  readonly timeToFirstReview: DurationStats | undefined;
  /** PR iteration count statistics */
  readonly iterationCount: CountStats;
  /** Lead time to production statistics (if available) */
  readonly leadTime: DurationStats | undefined;
}

interface DurationStats {
  /** Median in milliseconds */
  readonly medianMs: number;
  /** P90 in milliseconds */
  readonly p90Ms: number;
  /** Mean in milliseconds */
  readonly meanMs: number;
  /** Minimum in milliseconds */
  readonly minMs: number;
  /** Maximum in milliseconds */
  readonly maxMs: number;
  /** Sample count */
  readonly count: number;
}

interface CountStats {
  /** Median count */
  readonly median: number;
  /** P90 count */
  readonly p90: number;
  /** Mean count */
  readonly mean: number;
  /** Minimum count */
  readonly min: number;
  /** Maximum count */
  readonly max: number;
  /** Sample count */
  readonly count: number;
}
```

### Report Output Structure

```typescript
interface MetricsReport {
  /** Report generation timestamp */
  readonly generatedAt: string;
  /** Report period */
  readonly period: {
    readonly start: string;
    readonly end: string;
  };
  /** Current period metrics */
  readonly current: MetricsSummary;
  /** Previous period metrics (for comparison) */
  readonly previous: MetricsSummary | undefined;
  /** Week-over-week changes */
  readonly changes: MetricChanges | undefined;
}

interface MetricChanges {
  /** Change in total PRs merged */
  readonly totalPrsMerged: PercentChange;
  /** Change in delegation rate (percentage points) */
  readonly delegationRate: PointChange;
  /** Change in CI pass rate (percentage points) */
  readonly ciFirstRunPassRate: PointChange | undefined;
  /** Change in median cycle time */
  readonly cycleTimeMedian: PercentChange;
  /** Change in median iteration count */
  readonly iterationCountMedian: PercentChange;
}

interface PercentChange {
  /** Absolute change */
  readonly absolute: number;
  /** Percent change */
  readonly percent: number;
  /** Direction: "up" | "down" | "unchanged" */
  readonly direction: "up" | "down" | "unchanged";
}

interface PointChange {
  /** Change in percentage points */
  readonly points: number;
  /** Direction: "up" | "down" | "unchanged" */
  readonly direction: "up" | "down" | "unchanged";
}
```

### Storage Schema

```typescript
/** File: .sdlc-metrics/config.json */
interface MetricsConfig {
  /** Schema version for migrations */
  readonly schemaVersion: 1;
  /** Default repository */
  readonly repository: string;
  /** Agent co-author patterns to match */
  readonly agentPatterns: readonly string[];
  /** Baseline period dates */
  readonly baselinePeriod: {
    readonly start: string;
    readonly end: string;
  } | undefined;
}

/** File: .sdlc-metrics/data/YYYY-MM-DD.json */
type StoredPeriodMetrics = PeriodMetrics;

/** Directory structure */
interface StorageLayout {
  /** .sdlc-metrics/config.json - Configuration */
  readonly config: MetricsConfig;
  /** .sdlc-metrics/data/*.json - Daily metric snapshots */
  readonly data: Record<string, PeriodMetrics>;
  /** .sdlc-metrics/reports/*.md - Generated reports */
  readonly reports: Record<string, string>;
}
```

### GitHub GraphQL Client

```typescript
interface GitHubClient {
  /** Fetch merged PRs in date range */
  fetchMergedPullRequests(
    repo: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ServiceResult<readonly GitHubPullRequest[]>>;

  /** Fetch commit details including co-authors */
  fetchCommitDetails(
    repo: string,
    sha: string,
  ): Promise<ServiceResult<GitHubCommit>>;

  /** Fetch CI check runs for a commit */
  fetchCheckRuns(
    repo: string,
    sha: string,
  ): Promise<ServiceResult<readonly GitHubCheckRun[]>>;

  /** Fetch deployment events (if available) */
  fetchDeployments(
    repo: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ServiceResult<readonly GitHubDeployment[]>>;
}

interface GitHubPullRequest {
  readonly number: number;
  readonly title: string;
  readonly createdAt: string;
  readonly mergedAt: string;
  readonly additions: number;
  readonly deletions: number;
  readonly commits: {
    readonly totalCount: number;
    readonly nodes: readonly { readonly oid: string; readonly message: string }[];
  };
  readonly reviews: {
    readonly nodes: readonly { readonly submittedAt: string; readonly state: string }[];
  };
  readonly timelineItems: {
    readonly nodes: readonly TimelineItem[];
  };
}

type TimelineItem =
  | { readonly __typename: "PullRequestReview"; readonly submittedAt: string }
  | { readonly __typename: "HeadRefForcePushedEvent"; readonly createdAt: string }
  | { readonly __typename: "PullRequestCommit"; readonly commit: { readonly oid: string } };

interface GitHubCommit {
  readonly oid: string;
  readonly message: string;
  readonly messageBody: string;
  readonly authors: {
    readonly nodes: readonly { readonly name: string; readonly email: string }[];
  };
}

interface GitHubCheckRun {
  readonly name: string;
  readonly status: "QUEUED" | "IN_PROGRESS" | "COMPLETED";
  readonly conclusion: "SUCCESS" | "FAILURE" | "NEUTRAL" | "CANCELLED" | "SKIPPED" | "TIMED_OUT";
  readonly startedAt: string;
  readonly completedAt: string | undefined;
}

interface GitHubDeployment {
  readonly environment: string;
  readonly state: "PENDING" | "SUCCESS" | "FAILURE" | "INACTIVE" | "ERROR" | "QUEUED" | "IN_PROGRESS";
  readonly createdAt: string;
  readonly commitOid: string;
}
```

## Error Semantics

### Transient Errors (Retry)

- GitHub API rate limiting (HTTP 403 with rate limit header)
- Network timeouts
- GitHub API temporary unavailability (HTTP 5xx)

### Permanent Errors (Do Not Retry)

- Invalid repository format
- Repository not found (HTTP 404)
- Authentication failure (HTTP 401)
- Invalid date range
- File system permission errors

### Error Handling Strategy

```typescript
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
} as const;

/** Retry with exponential backoff for transient errors */
async function withRetry<T>(
  operation: () => Promise<ServiceResult<T>>,
  isRetryable: (error: ServiceError) => boolean,
): Promise<ServiceResult<T>> {
  // Implementation uses exponential backoff
}
```

## Implementation Details

### Package Structure

```text
packages/sdlc-metrics/
  src/
    bin/
      cli.ts              # CLI entry point
    lib/
      collectors/
        prMetrics.ts      # PR cycle time, iterations
        agentContribution.ts  # Delegation rate detection
        ciMetrics.ts      # CI pass rate collection
        leadTime.ts       # Lead time to production
        index.ts
      github/
        client.ts         # GitHub GraphQL client wrapper
        queries.ts        # GraphQL query definitions
        types.ts          # GitHub response types
        index.ts
      storage/
        config.ts         # Config file management
        metrics.ts        # Metrics file management
        index.ts
      report/
        generator.ts      # Report generation logic
        markdown.ts       # Markdown formatting
        comparison.ts     # Week-over-week comparison
        index.ts
      statistics/
        duration.ts       # Duration statistics (median, p90)
        counts.ts         # Count statistics
        index.ts
      types.ts            # Shared type definitions
      index.ts
    index.ts              # Public exports
  project.json
  package.json
  jest.config.ts
  tsconfig.lib.json
  tsconfig.spec.json
  README.md
```

### GitHub GraphQL Queries

```typescript
/** Query merged PRs with timeline data */
const MERGED_PRS_QUERY = `
  query MergedPRs($owner: String!, $repo: String!, $after: String, $since: DateTime!) {
    repository(owner: $owner, name: $repo) {
      pullRequests(
        first: 100
        after: $after
        states: MERGED
        orderBy: { field: UPDATED_AT, direction: DESC }
      ) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          number
          title
          createdAt
          mergedAt
          additions
          deletions
          commits(first: 100) {
            totalCount
            nodes {
              commit {
                oid
                message
                messageBody
              }
            }
          }
          reviews(first: 50) {
            nodes {
              submittedAt
              state
            }
          }
          timelineItems(first: 100, itemTypes: [
            PULL_REQUEST_REVIEW,
            HEAD_REF_FORCE_PUSHED_EVENT,
            PULL_REQUEST_COMMIT
          ]) {
            nodes {
              __typename
              ... on PullRequestReview {
                submittedAt
              }
              ... on HeadRefForcePushedEvent {
                createdAt
              }
              ... on PullRequestCommit {
                commit {
                  oid
                }
              }
            }
          }
        }
      }
    }
  }
`;

/** Query CI check runs for a commit */
const CHECK_RUNS_QUERY = `
  query CheckRuns($owner: String!, $repo: String!, $oid: GitObjectID!) {
    repository(owner: $owner, name: $repo) {
      object(oid: $oid) {
        ... on Commit {
          checkSuites(first: 10) {
            nodes {
              checkRuns(first: 50) {
                nodes {
                  name
                  status
                  conclusion
                  startedAt
                  completedAt
                }
              }
            }
          }
        }
      }
    }
  }
`;
```

### Agent Contribution Detection

```typescript
const DEFAULT_AGENT_PATTERNS = [
  "Co-Authored-By:.*Claude",
  "Co-Authored-By:.*claude",
  "Co-Authored-By:.*anthropic",
  "Co-Authored-By:.*Copilot",
  "Co-Authored-By:.*copilot",
  "Co-Authored-By:.*github-actions",
] as const;

function hasAgentContribution(
  commits: readonly { readonly message: string; readonly messageBody: string }[],
  patterns: readonly string[],
): boolean {
  const combinedPattern = new RegExp(patterns.join("|"), "i");
  return commits.some(
    (commit) =>
      combinedPattern.test(commit.message) ||
      combinedPattern.test(commit.messageBody),
  );
}
```

### PR Iteration Count Calculation

```typescript
/**
 * Count review cycles: number of times commits were pushed after a review.
 * A review cycle is: review submitted -> commits pushed -> (repeat)
 */
function calculateIterationCount(
  timelineItems: readonly TimelineItem[],
): number {
  let iterations = 0;
  let lastReviewTime: Date | undefined;

  const sortedItems = [...timelineItems].sort(
    (a, b) => new Date(getItemTime(a)).getTime() - new Date(getItemTime(b)).getTime(),
  );

  for (const item of sortedItems) {
    if (item.__typename === "PullRequestReview") {
      lastReviewTime = new Date(item.submittedAt);
    } else if (
      (item.__typename === "HeadRefForcePushedEvent" ||
        item.__typename === "PullRequestCommit") &&
      lastReviewTime
    ) {
      const itemTime = new Date(getItemTime(item));
      if (itemTime > lastReviewTime) {
        iterations++;
        lastReviewTime = undefined; // Reset for next cycle
      }
    }
  }

  return iterations;
}
```

### Storage Strategy

Metrics are stored as JSON files in `.sdlc-metrics/` directory:

```text
.sdlc-metrics/
  config.json           # Repository config, agent patterns
  data/
    2026-01-13.json     # Week of 2026-01-13
    2026-01-20.json     # Week of 2026-01-20
  reports/
    2026-01-13.md       # Generated report for week
```

Files are named by period start date. Collection is idempotent: re-running for the same period overwrites previous data.

### CLI Implementation

```typescript
#!/usr/bin/env node
import { Command, Option } from "@commander-js/extra-typings";

import { description, name, version } from "../../package.json";
import { collect } from "../lib/collectors";
import { generateReport } from "../lib/report";
import { exportMetrics } from "../lib/storage";

const program = new Command()
  .name(name)
  .description(description)
  .version(String(version));

program
  .command("collect")
  .description("Collect metrics for a time period")
  .addOption(
    new Option("-p, --period <period>", "time period")
      .choices(["day", "week", "month"] as const)
      .default("week" as const),
  )
  .addOption(new Option("-r, --repo <repo>", "repository (owner/repo)"))
  .addOption(new Option("-o, --output <dir>", "output directory"))
  .addOption(new Option("-v, --verbose", "verbose output").default(false))
  .action(async (options) => {
    const result = await collect(options);
    // Handle result...
  });

program
  .command("report")
  .description("Generate metrics report")
  .addOption(
    new Option("-p, --period <period>", "time period")
      .choices(["day", "week", "month"] as const)
      .default("week" as const),
  )
  .addOption(
    new Option("-f, --format <format>", "output format")
      .choices(["markdown", "json"] as const)
      .default("markdown" as const),
  )
  .addOption(new Option("--no-compare", "skip week-over-week comparison"))
  .addOption(new Option("-o, --output <file>", "output file"))
  .action(async (options) => {
    const result = await generateReport(options);
    // Handle result...
  });

program
  .command("export")
  .description("Export raw metrics data")
  .requiredOption("-s, --start <date>", "start date (YYYY-MM-DD)")
  .requiredOption("-e, --end <date>", "end date (YYYY-MM-DD)")
  .addOption(
    new Option("-f, --format <format>", "output format")
      .choices(["json", "csv"] as const)
      .default("json" as const),
  )
  .addOption(new Option("-o, --output <file>", "output file"))
  .action(async (options) => {
    const result = await exportMetrics(options);
    // Handle result...
  });

program
  .command("baseline")
  .description("View or set baseline metrics")
  .addOption(new Option("--show", "show baseline summary").default(false))
  .action(async (options) => {
    // Handle baseline...
  });

program
  .command("audit")
  .description("Select PRs for quality audit")
  .addOption(
    new Option("-n, --select <count>", "number of PRs to select")
      .argParser(parseInt)
      .default(5),
  )
  .addOption(
    new Option("-p, --period <period>", "time period")
      .choices(["week", "month"] as const)
      .default("week" as const),
  )
  .action(async (options) => {
    // Handle audit selection...
  });

program.parse();
```

## Rollout Strategy

Since this is an internal CLI tool, a simplified rollout applies:

### Phase 1: Development Testing (Week 1)

- Implement core collectors and storage
- Unit tests with mocked GitHub responses
- Integration tests against test repository

### Phase 2: Internal Testing (Week 2)

- Test against 2-3 active repositories
- Validate metric accuracy manually
- Gather feedback from early adopters

### Phase 3: Team Adoption (Week 3-4)

- Documentation and README
- Publish to internal npm registry
- Establish baseline metrics period

## Rollback Strategy

### Data Migration Considerations

- Schema version stored in `config.json`
- Future schema changes require migration scripts
- Old data files preserved during migration

### Rollback Steps

1. Revert to previous CLI version via npm
2. Data files remain readable (JSON format)
3. No external service state to rollback

## Verification Spec

### SC-1: Core DORA Metrics Collection

| Test Case | Type | Description |
| --- | --- | --- |
| SC-1.1 | Unit | Calculate lead time from commit to deployment |
| SC-1.2 | Unit | Handle missing deployment data gracefully |
| SC-1.3 | Integration | Fetch deployment events from GitHub |

### SC-2: Pull Request Metrics Collection

| Test Case | Type | Description |
| --- | --- | --- |
| SC-2.1 | Unit | Calculate PR cycle time (open to merge) |
| SC-2.2 | Unit | Calculate time to first review |
| SC-2.3 | Unit | Count PR iterations correctly |
| SC-2.4 | Unit | Categorize PR size (xs/s/m/l/xl) |
| SC-2.5 | Integration | Fetch merged PRs with timeline data |

### SC-3: Agent Contribution Metrics

| Test Case | Type | Description |
| --- | --- | --- |
| SC-3.1 | Unit | Detect Claude co-author in commit message |
| SC-3.2 | Unit | Detect Claude co-author in message body |
| SC-3.3 | Unit | Calculate delegation rate percentage |
| SC-3.4 | Unit | Support custom agent patterns |

### SC-4: Quality Guardrail Metrics

| Test Case | Type | Description |
| --- | --- | --- |
| SC-4.1 | Unit | Calculate CI first-run pass rate |
| SC-4.2 | Unit | Handle PRs without CI checks |
| SC-4.3 | Unit | Random audit PR selection |
| SC-4.4 | Integration | Fetch CI check run status |

### SC-5: Reporting and Output

| Test Case | Type | Description |
| --- | --- | --- |
| SC-5.1 | Unit | Generate Markdown report format |
| SC-5.2 | Unit | Generate JSON report format |
| SC-5.3 | Unit | Calculate week-over-week changes |
| SC-5.4 | Unit | Export data as JSON |
| SC-5.5 | Unit | Export data as CSV |
| SC-5.6 | Integration | Full collect -> report flow |

### Non-Functional Requirements

| Test Case | Type | Description |
| --- | --- | --- |
| NFR-1 | Integration | Collection completes within 5 minutes for 1000 PRs |
| NFR-2 | Integration | Report generation completes within 30 seconds |
| NFR-3 | Unit | Collection is idempotent (same input = same output) |
| NFR-4 | Unit | No PII stored in metric files |

## Security Considerations

### API Token Handling

- Uses `gh` CLI which manages authentication securely
- No tokens stored in config files
- Relies on `gh auth login` for authentication

### Data Privacy

- PR titles stored for reference but not in reports
- No commit message content stored (only co-author detection)
- No developer names/emails in aggregated reports
- Individual metrics aggregated by default

### File System Security

- `.sdlc-metrics/` directory should be gitignored
- Sensitive data (if any) stays local
- No network transmission of metric data

## Dependencies

### Runtime Dependencies

| Package | Version | Purpose |
| --- | --- | --- |
| `@commander-js/extra-typings` | 14.x | CLI framework with TypeScript support |
| `@clipboard-health/util-ts` | workspace | ServiceResult, ServiceError |
| `tslib` | 2.x | TypeScript runtime helpers |
| `date-fns` | 3.x | Date manipulation and formatting |

### Dev Dependencies

| Package | Version | Purpose |
| --- | --- | --- |
| `@nx/jest` | workspace | Test runner configuration |
| `typescript` | workspace | TypeScript compiler |

### External Dependencies

| Dependency | Version | Status |
| --- | --- | --- |
| `gh` CLI | 2.x+ | Required, user must install |
| GitHub API | v4 (GraphQL) | Available |

## Open Design Questions

1. **Deployment Tracking:** The product brief mentions lead time to production, but deployment tracking varies by project. Should we:
   - Support GitHub Deployments API only?
   - Add support for custom deployment markers (tags/releases)?
   - Make this metric optional initially?

2. **CI Provider Abstraction:** Currently assumes GitHub Actions. Should we:
   - Support other CI providers (CircleCI, Jenkins)?
   - Abstract CI status behind a provider interface?
   - Keep GitHub Actions-only for MVP?

3. **Linear Integration:** The product brief mentions Linear API for ticket data. Should we:
   - Include Linear integration in MVP?
   - Defer to future phase?
   - Make it optional via config?

4. **Audit Workflow:** How should the audit selection persist?
   - Store in `.sdlc-metrics/audits/` directory?
   - Integrate with Linear tickets?
   - Just output to stdout?

5. **Multi-Repo Support:** Should the tool support:
   - Single repo (current design)?
   - Multiple repos with aggregation?
   - Organization-wide metrics?

---

## Appendix A: Sample Report Output

```markdown
# SDLC Productivity Metrics - Week of 2026-01-13

## Summary

| Metric | This Week | Last Week | Change |
| --- | --- | --- | --- |
| PRs Merged | 45 | 40 | +12% |
| Delegation Rate | 34% | 29% | +5pp |
| CI Pass Rate | 87% | 89% | -2pp |

## Detailed Metrics

### PR Cycle Time

| Statistic | This Week | Last Week |
| --- | --- | --- |
| Median | 18h | 22h |
| P90 | 48h | 52h |
| Mean | 24h | 28h |

### Agent Contribution

- PRs with agent diffs: 15/45 (33%)
- Agent patterns matched: `Co-Authored-By: *Claude*`

### Quality Indicators

- CI first-run pass rate: 87%
- Average PR iterations: 1.8

## Audit Queue

The following PRs were randomly selected for quality audit:

- PR #1234: Add user authentication flow
- PR #1256: Fix pagination bug in listings

---

Generated: 2026-01-20T10:00:00Z
```

## Appendix B: Storage File Examples

### config.json

```json
{
  "schemaVersion": 1,
  "repository": "ClipboardHealth/core-utils",
  "agentPatterns": [
    "Co-Authored-By:.*Claude",
    "Co-Authored-By:.*anthropic"
  ],
  "baselinePeriod": {
    "start": "2026-01-01",
    "end": "2026-01-28"
  }
}
```

### data/2026-01-13.json

```json
{
  "periodStart": "2026-01-13",
  "periodEnd": "2026-01-19",
  "repository": "ClipboardHealth/core-utils",
  "collectedAt": "2026-01-20T10:00:00Z",
  "summary": {
    "totalPrsMerged": 45,
    "delegationRate": 0.34,
    "ciFirstRunPassRate": 0.87,
    "cycleTime": {
      "medianMs": 64800000,
      "p90Ms": 172800000,
      "meanMs": 86400000,
      "minMs": 3600000,
      "maxMs": 259200000,
      "count": 45
    },
    "iterationCount": {
      "median": 1,
      "p90": 3,
      "mean": 1.8,
      "min": 0,
      "max": 5,
      "count": 45
    }
  },
  "pullRequests": [],
  "leadTimes": []
}
```
