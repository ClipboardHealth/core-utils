---
name: json-api-endpoint
description: Use when creating, modifying, or reviewing a REST API endpoint in the Clipboard Health codebase. Also use when auditing existing endpoints for compliance with BP Contracts and BP REST API best practices.
---

# JSON:API Endpoints

Guide for creating and reviewing REST API endpoints that follow JSON:API spec, BP: Contracts, BP: REST API, and codebase conventions.

## When to Use

- Creating a new REST API endpoint from scratch
- Adding a new route to an existing controller
- Reviewing or auditing an existing endpoint for BP compliance
- Modifying an existing contract, controller, or response shape

**Not for:** Non-REST endpoints, GraphQL, internal event handlers, or cron jobs.

## Quick Reference

| Rule                                          | Source        | Key point                                                          |
| --------------------------------------------- | ------------- | ------------------------------------------------------------------ |
| `dateTimeSchema()` for dates                  | BP: Contracts | Not `z.coerce.date()`, `z.string().datetime()`, or `z.string()`    |
| `requiredEnumWithFallback` for enums          | BP: Contracts | Include `"unspecified"` fallback; handle it explicitly in app code |
| No `.default()` in contracts                  | BP: Contracts | Defaults belong in service layer                                   |
| `Schema` suffix on schema names               | BP: Contracts | `ShiftAttributeSchema`, not `shiftAttribute`                       |
| Export at DTO boundary only                   | BP: Contracts | Deeply nested Zod exports slow typechecking                        |
| Compose relationships from shared schemas     | BP: Contracts | Don't redefine `type` literals per contract                        |
| `parsedApi.ts` for all new API calls          | BP: Contracts | Makes `dateTimeSchema()` work at runtime; invalid contracts throw  |
| Contract in `contract-<repo>` package         | BP: REST API  | Don't duplicate contracts across repos                             |
| Singular `type` values                        | BP: REST API  | `"worker"` not `"workers"`                                         |
| `lowerCamelCase` JSON keys                    | BP: REST API  | Not snake_case, PascalCase, or kebab-case                          |
| URLs: lower kebab-case plural nouns           | BP: REST API  | No verbs, no camelCase, no underscores                             |
| GET/POST/PATCH/DELETE only                    | BP: REST API  | No PUT — JSON:API doesn't use it                                   |
| POST returns DTO in body                      | BP: REST API  | Not raw DB representation                                          |
| Links only for pagination                     | BP: REST API  | No `self` link, no relationship links                              |
| Relationships: data linkage only              | BP: REST API  | Use `include` query params, not relationship links                 |
| Avoid `meta` unless computed/derived          | BP: REST API  | Static attributes belong in `attributes`                           |
| Return only what clients require              | BP: REST API  | Adding fields = non-breaking; removing = breaking                  |
| Favor generic over feature-specific APIs      | BP: REST API  | Reduce cross-team coordination                                     |
| Numeric field names include units             | BP: REST API  | `lateTimeInHours` not `lateTime`                                   |
| Money: `{ amountInMinorUnits, currencyCode }` | BP: REST API  | Never bare numbers for currency                                    |
| Floats as strings                             | BP: REST API  | Precision issues with Prisma/decimal.js                            |
| Cursor-based pagination only                  | BP: REST API  | No offset, no count totals                                         |
| 400 for unsupported query params              | BP: REST API  | Applies to sort, filter, include, fields, page                     |
| Wrap multi-write ops in transactions          | BP: REST API  | Includes background job enqueuing                                  |
| Standard HTTP status codes                    | BP: REST API  | 200, 201, 400, 401, 403, 404, 409, 422, 429, 500                   |

## Before Writing Code

### 1. Audit existing contracts for the same resource types

**This is the most important step.** Search for existing contracts that return the same `type` values you'll use in `data` or `included`.

```bash
grep -rn "z.literal(API_TYPES.interview)" src/modules/*/contracts/
```

**If an existing schema exists for a type, adopt it.** Widen with optional fields if needed. If shapes genuinely differ, document why in a code comment.

### 2. Check for reusable helpers

Search for pagination helpers (`getPaginationLinks`, `getMatchFilterForCursor`, `encodeCursor`), enrichment services, and shared schemas in `contract-core` / `contract-backend-main` before implementing your own.

### 3. Design the URL

Lower kebab-case plural nouns, not verbs. See `reference.md` for examples.

Split endpoints when different actors have different access patterns:

```text
GET /workers/:workerId/rankings        # Worker's own
GET /workplaces/:workplaceId/rankings  # Workplace's
```

## Contract Layer

### Schema rules

**Dates:** Use `dateTimeSchema()` from `@clipboard-health/contract-core`. Requires `parsedApi.ts` on frontend — without it, types say `Date` but runtime is `string`. Invalid contracts cause **user-facing failures** (`parsedApi.ts` throws on schema mismatch) monitored via Datadog RUM → `#proj-contract-validation`. See `reference.md` for examples.

**Enums:** Use `requiredEnumWithFallback` / `optionalEnumWithFallback` with `"unspecified"` fallback. Handle `"unspecified"` as its own case in app code — don't map it to an existing meaningful value. Log it so you can detect clients needing updates. Use strict variants (`requiredEnum` / `optionalEnum`) only when caller MUST understand every value to function (rare). Never use `.catch()` for fallbacks.

**Naming:** `Schema` suffix on all schemas. Export at DTO boundary only.

**Other rules:**

- No `.default()` in contracts — defaults go in service layer
- Validate path params at contract boundary (e.g., `ObjectIdSchema`)
- Return `400` for unsupported query params
- Compose relationships from shared schemas
- Put contracts in `contract-<backend-repo-name>` package, not duplicated across repos

### Query params, response structure, cursors

See `reference.md` for code examples covering filters, sort, cursor-based pagination, response structure with `included`, and cursor types.

## Error Handling

Use standard HTTP status codes:

| Code | When                                                        |
| ---- | ----------------------------------------------------------- |
| 200  | Successful GET, PATCH, DELETE                               |
| 201  | Successful POST (return DTO in body)                        |
| 400  | Syntactic validation errors, unsupported query params       |
| 401  | Missing or invalid auth token                               |
| 403  | Valid token but insufficient permissions                    |
| 404  | Resource not found (for GET by ID)                          |
| 409  | Resource already exists                                     |
| 422  | Semantic validation errors (e.g., invalid state transition) |
| 429  | Rate limited                                                |
| 500  | Unhandled server error (should be rare)                     |

For GET with to-one mapping where entity exists but related data doesn't: return 200 with `null` data. For to-many: return 200 with empty array.

Error body follows JSON:API format:

```json
{
  "errors": [
    {
      "code": "OutOfRange",
      "status": "400",
      "title": "Invalid, missing, or out-of-range request parameters."
    }
  ]
}
```

All JSON keys must be `lowerCamelCase` — not snake_case, PascalCase, or kebab-case.

## Numeric Types

- Include base unit in field names: `lateTimeInHours` not `lateTime`
- Money fields: `{ amountInMinorUnits: number, currencyCode: string }`
- Integers: standard JS number, no stringification, no `.0` decimals
- Floats: return as **strings** for precision safety (Prisma/decimal.js)

## Divergence Flags

When implementing or reviewing, **stop and flag to the user** if any of these occur:

| Situation                                                      | What to say                                                                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| New schema for a `type` that exists in another contract        | "BP violation: `type: X` already has a schema in `<file>`. We should adopt that shape or explain why we diverge."              |
| `z.coerce.date()`, `z.string()`, or `z.date()` for date fields | "BP: Contracts violation: use `dateTimeSchema()` from `@clipboard-health/contract-core`. `z.coerce.date()` is too permissive." |
| Bare `z.enum()` or `z.nativeEnum()` for response enums         | "BP: Contracts violation: use `requiredEnumWithFallback` / `optionalEnumWithFallback` for forwards compatibility."             |
| `"unspecified"` enum case mapped to existing meaningful value  | "BP: Contracts violation: handle `\"unspecified\"` as its own case, don't map it to an existing value. Log it for visibility." |
| `.default()` in a contract schema                              | "BP: Contracts violation: defaults belong in the service layer, not contracts."                                                |
| Schema without `Schema` suffix                                 | "BP: Contracts violation: name schemas with a `Schema` suffix."                                                                |
| Deeply nested intermediate schemas exported                    | "BP: Contracts violation: export at the DTO boundary only — deeply nested Zod exports slow typechecking."                      |
| Relationship type literals redefined per contract              | "BP: Contracts violation: compose relationships from shared schemas."                                                          |
| Contract duplicated across repos                               | "BP: REST API violation: contracts belong in `contract-<backend-repo-name>` package."                                          |
| Frontend call not using `parsedApi.ts`                         | "BP: Contracts violation: all new API calls must use `parsedApi.ts`. Without it, `dateTimeSchema()` types lie at runtime."     |
| Plural `type` value                                            | "BP: REST API violation: use singular `type` (e.g., `\"worker\"` not `\"workers\"`)."                                          |
| `PUT` method                                                   | "BP: REST API violation: JSON:API doesn't use PUT. Use PATCH for updates."                                                     |
| POST returning raw DB shape                                    | "BP: REST API violation: POST should return the DTO, not raw database representation."                                         |
| `self` link or relationship links in response                  | "BP: REST API violation: links are only for pagination. Use `include` query params instead of relationship links."             |
| `meta` used for non-computed fields                            | "BP: REST API violation: avoid `meta`. Computed/derived fields are valid; static attributes belong in `attributes`."           |
| Pay/money fields not using Money pattern                       | "BP: REST API violation: use `{ amountInMinorUnits, currencyCode }` for currency."                                             |
| Numeric field name without units                               | "BP: REST API violation: include base unit in name (e.g., `lateTimeInHours` not `lateTime`)."                                  |
| Float returned as number instead of string                     | "BP: REST API violation: return floats as strings for precision safety."                                                       |
| Bare `number[]` for coordinates                                | "Ambiguous ordering: `[lng, lat]` vs `[lat, lng]`. Consider `{ longitude, latitude }`."                                        |
| Inline Zod schemas for included resources                      | "Extract as named exported `Schema`-suffixed constants for reuse."                                                             |
| Enrichment logic duplicated from another service               | "This enrichment exists in `<service>`. Extract to shared method or reuse existing."                                           |
| Count totals in paginated responses                            | "BP: REST API violation: avoid count totals — performance degrades with data growth."                                          |
| Offset pagination                                              | "BP: REST API violation: use cursor-based pagination only."                                                                    |
| Multi-write operation without transaction                      | "BP: REST API violation: wrap multi-write ops (including background job enqueuing) in a database transaction."                 |
| Feature-specific API when generic would serve                  | "BP: REST API violation: favor generic APIs over feature-specific ones to reduce cross-team coordination."                     |
| JSON keys not `lowerCamelCase`                                 | "BP: REST API violation: JSON keys must be `lowerCamelCase`, not snake_case, PascalCase, or kebab-case."                       |

## Architecture Pattern

See `reference.md` for file structure, layer responsibilities, enrichment pattern, and pagination pattern details.

Key principles: Contract (schemas, no logic) → Controller (auth, cursor, pagination links, DTO mapping) → Service (orchestration, defaults, `Promise.all`) → Repository (MongoDB pipeline) → DAO/DO (type mapping). See `reference.md` for file structure and layer details.

## Reviewing Existing Endpoints

Use this checklist when auditing an endpoint for BP compliance. Search the contract, controller, service, and test files.

### Contract Compliance (BP: Contracts)

- [ ] All date fields use `dateTimeSchema()`
- [ ] All response enums use `requiredEnumWithFallback` / `optionalEnumWithFallback` with `"unspecified"`
- [ ] `"unspecified"` handled as its own case in app code (not mapped to a meaningful value)
- [ ] No `.default()` in contract schemas
- [ ] All schemas named with `Schema` suffix
- [ ] Relationships composed from shared schemas (no per-contract `type` literal redefinition)
- [ ] Exported only at DTO boundary (request/response schemas)
- [ ] Contract lives in `contract-<backend-repo-name>` package
- [ ] Frontend consumers use `parsedApi.ts`

### API Design Compliance (BP: REST API)

- [ ] `type` values are singular (e.g., `"worker"` not `"workers"`)
- [ ] `type` shape is consistent with same type in other contracts
- [ ] JSON keys are `lowerCamelCase`
- [ ] URL is lower kebab-case plural nouns, no verbs
- [ ] HTTP methods: only GET/POST/PATCH/DELETE (no PUT)
- [ ] POST returns DTO in body (not raw DB representation)
- [ ] Links only used for pagination (no `self` link)
- [ ] Relationships use data linkage only (no relationship links)
- [ ] `meta` only used for computed/derived fields
- [ ] Numeric field names include units (e.g., `lateTimeInHours`)
- [ ] Money fields use `{ amountInMinorUnits, currencyCode }`
- [ ] Floats returned as strings
- [ ] Error responses use standard status codes (200/201/400/401/403/404/409/422/429/500)
- [ ] Unsupported filter/sort/page/include/fields params return 400
- [ ] Cursor-based pagination (no offset, no count totals)
- [ ] Multi-write operations wrapped in transactions (including background jobs)
- [ ] API is generic, not feature-specific (where applicable)
- [ ] Returns only what clients require

### Service Tests

- [ ] Auth: forbidden + success cases
- [ ] Response shape: `data`, `included`, `relationships`, `meta` structure
- [ ] Filters: each filter param with positive and negative cases
- [ ] Sort: default order + explicit direction
- [ ] Pagination: forward cursor, backward cursor, no next on last page, order preserved
- [ ] Validation: invalid query params return 400

Use `beforeAll`/`afterAll` for GET endpoint tests per AGENTS.md.

## Common Mistakes

| Mistake                                                  | Fix                                                                                                  |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Using `z.coerce.date()` because it "just works"          | It accepts epoch numbers and date-only strings. Use `dateTimeSchema()`.                              |
| Adding `.catch("workplace")` to enum                     | Maps unknowns to meaningful value, hiding bugs. Use `requiredEnumWithFallback` with `"unspecified"`. |
| Mapping `"unspecified"` to same branch as existing value | Hides unknown values. Give it its own case with logging.                                             |
| Creating a new schema for `type: "worker"`               | Search contracts first — adopt existing shape, widen with optional fields.                           |
| Returning count totals "just for the UI"                 | Performance degrades at scale. Already caused production timeouts.                                   |
| Putting `.default()` in contract                         | Client/server drift on default values. Set in service layer.                                         |
| Returning raw MongoDB document from POST                 | POST must return the DTO. Map through your DTO layer.                                                |
| Forgetting `parsedApi.ts` on frontend                    | Types say `Date` but runtime is `string`. Schema validation errors hit users.                        |
