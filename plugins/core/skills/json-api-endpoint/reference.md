# JSON:API Endpoint Reference

Code examples and detailed patterns for the json-api-endpoint skill.

## URL Design

```text
GET  /workers/:workerId/placement-applications     # Good: nested resource
GET  /get-worker-applications                       # Bad: verb in URL
GET  /workerApplications                            # Bad: not kebab-case
GET  /worker-application                            # Bad: not plural
```

## Contract Examples

### Date and enum fields

```typescript
import { dateTimeSchema, requiredEnumWithFallback } from "@clipboard-health/contract-core";

const InterviewAttributeSchema = z.object({
  start: dateTimeSchema(), // Strict ISO-8601 → Date
  end: dateTimeSchema(),
  createdAt: dateTimeSchema(),
  status: requiredEnumWithFallback(
    ["unspecified", "booked", "completed", "cancelled"] as const,
    "unspecified",
  ),
});
```

### Handling "unspecified" correctly

```typescript
// ❌ Maps "unspecified" to same behavior as "workplace" — hides unknown values
function getSourceLabel(source: Source): string {
  switch (source) {
    case "workplace-chat":
      return "Chat";
    case "workplace":
    case "unspecified":
      return "Workplace";
  }
}

// ✅ Handles "unspecified" as its own case — makes unknown values visible
function getSourceLabel(source: Source): string {
  switch (source) {
    case "workplace-chat":
      return "Chat";
    case "workplace":
      return "Workplace";
    case "unspecified":
      logEvent(APP_V2_APP_EVENTS.UNKNOWN_SOURCE_VALUE);
      return "Unknown";
  }
}
```

### Query params

```typescript
// Filters: field-based, nested operators for ranges
filter: z.object({
  status: z.enum(ALLOWED_STATUSES).optional(),
  "placement.status": commaSeparatedToArray.pipe(z.array(z.enum(PLACEMENT_STATUS))).optional(),
  "interview.start": z.object({
    gt: z.string().optional(),  // Accepts "now" or ISO date
    lt: z.string().optional(),
  }).optional(),
}).optional(),

// Sort: simple direction when sort field is fixed
sort: z.enum(["asc", "desc"]).optional(),

// Pagination: cursor-based only, no offset, no count totals
page: z.object({
  size: z.string().transform(v => Number.parseInt(v, 10)).pipe(z.number().int().positive()).optional(),
  cursor: z.string().optional(),
}).optional(),
```

### Response structure

```typescript
export const WorkerInterviewIncludeSchema = z.object({
  type: z.literal(API_TYPES.interview),
  id: z.string(),
  attributes: InterviewAttributeSchema,
  meta: z.object({ ... }).optional(),
  relationships: z.object({ ... }).optional(),
});

// Use in response — discriminated union for included
included: z.array(
  z.discriminatedUnion("type", [
    WorkerPlacementIncludeSchema,
    WorkerWorkplaceIncludeSchema,
    WorkerInterviewIncludeSchema,
  ]),
).optional(),
```

### Cursor type

```typescript
export interface MyCursor {
  id: string;
  sortDate: string;
  cursorType: "next" | "prev";
}
```

## Architecture Pattern

### File structure

```text
modules/<domain>/
  contracts/<domain>.contract.ts        # Zod schemas + ts-rest contract
  controllers/<resource>.controller.ts  # HTTP layer, pagination links, auth
  controllers/<resource>.dto.ts         # Response mapping (DO → JSON:API shape)
  services/<resource>.service.ts        # Business logic, enrichment orchestration
  services/<resource>.do.ts             # Domain object interface
  repositories/<resource>.repository.ts # DB queries (extend existing repo)
  repositories/<resource>.dao.ts        # Aggregate + DAO types, mapping functions
```

### Layer responsibilities

- **Contract**: Zod schemas, ts-rest route definition. No business logic.
- **Controller**: Decode cursor, compute pagination links, call service, map via DTO. Auth via `@AllowByCustomAuthorizer`.
- **DTO**: Map DO → JSON:API response shape. Build `included` array with deduplication via `uniqBy`.
- **Service**: Orchestrate repository call + enrichment. Set defaults (e.g., sort direction). Parallelize independent fetches with `Promise.all`.
- **Repository**: MongoDB aggregation pipeline. Return DAO types.
- **DAO**: Aggregate type (raw MongoDB shape) + DAO type (clean domain shape) + mapping function.
- **DO**: Interface for the enriched domain object returned by the service.

### Enrichment pattern

```typescript
// Good: delegate to shared service
const licenseEligibilityMap = await this.enrichmentService.getLicenseEligibilityForPlacements({ ... });

// Bad: inline the same logic that exists in the enrichment service
const nlcActiveStates = await fetchNlcActiveStates();
const config = await this.featureFlagService.get(...);
// ... 20 lines of manual eligibility checking
```

### Pagination pattern

Use `pageSize + 1` fetch pattern with `getMatchFilterForCursor`:

```typescript
// Repository: fetch one extra to detect "has more"
pipeline.push({ $limit: pageSize + 1 });

// Controller: slice and build links
const hasMore = results.length > pageSize;
const pageData = hasMore ? results.slice(0, pageSize) : results;
```

For bidirectional cursor pagination:

1. `getMatchFilterForCursor` handles comparison operators based on sort direction
2. Reverse sort stage for prev cursors, then `toReversed()` on results to restore display order
3. Include `_id` as tiebreaker in sort for cursor stability

## Helper Libraries

- [`util-api`](https://github.com/ClipboardHealth/cbh-core/tree/main/packages/util-api#usage) — TypeScript types and examples
- [`json-api`](https://github.com/ClipboardHealth/core-utils/tree/main/packages/json-api) — Query helpers (gt, gte, lt, lte, not)
- [`api-nestjs`](https://github.com/ClipboardHealth/cbh-core/tree/main/packages/api-nestjs) — HTTP exception filter for NestJS
- [`contract-core`](https://github.com/ClipboardHealth/core-utils/tree/main/packages/contract-core) — Zod schemas and types for JSON:API
- [`template-nestjs` bunny module](https://github.com/ClipboardHealth/template-nestjs/tree/main/src/modules/bunny) — Reference implementation for DTOs, DAOs, ts-rest
