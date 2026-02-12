# REST API Design

## JSON:API Specification

Follow [JSON:API spec](https://jsonapi.org/).

```json
{
  "data": [
    {
      "id": "1",
      "type": "shift",
      "attributes": { "qualification": "nurse" },
      "relationships": {
        "assignedWorker": {
          "data": { "type": "worker", "id": "9" }
        },
        "location": {
          "data": { "type": "workplace", "id": "17" }
        }
      }
    }
  ]
}
```

- Singular `type` values: `shift` not `shifts`
- Links optional (use only for pagination)
- Use `include` for related resources
- Avoid `meta` unless necessary
- Use lowerCamelCase for JSON keys

## Error Responses

Return errors using JSON:API `errors` array with `code`, `status`, and `title` fields.

## URLs

```text
GET /urgent-shifts                    # lowercase kebab-case, plural nouns
GET /workers/:workerId/shifts
POST /workers/:workerId/referral-codes
```

## HTTP Conventions

- No PUT support — use PATCH for updates
- POST returns the created resource DTO
- Use only GET, POST, PATCH, DELETE
- GET must be idempotent with no side effects
- Model state changes as PATCH to resource attributes (not action-specific POST endpoints)

## HTTP Status Codes

| Code | Usage                                                 |
| ---- | ----------------------------------------------------- |
| 200  | GET, PATCH, DELETE success                            |
| 201  | POST creation                                         |
| 202  | Accepted (async processing)                           |
| 400  | Syntactic errors or unsupported query params          |
| 401  | Unauthenticated                                       |
| 403  | Forbidden                                             |
| 404  | Not found                                             |
| 409  | Conflict                                              |
| 422  | Semantic validation errors, unsupported filters/sorts |
| 429  | Rate limited                                          |
| 500  | Server error                                          |

## Authentication & Authorization

- Require a valid bearer token on every non-public endpoint
- Use `auth-guard` for service-to-service auth
- Endpoints must return only resources the authenticated requestor is authorized to access

## Input Validation

Apply input validation in order: normalization first, then syntactic checks, then semantic checks. Validate query params, body, path params, headers, and cookies.

## Filtering, Sorting, Pagination

```text
GET /shifts?filter[verified]=true&sort=startDate,-urgency&page[cursor]=abc&page[size]=50
```

- Cursor-based pagination only (not offset)
- Avoid count totals (performance)
- Only implement filters/sorts clients need

## Contracts

- Add contracts to `contract-<microservice-name>` package
- Use `ts-rest` with composable Zod schemas (enforced by `enforce-ts-rest-in-controllers`)

## Data Transfer

- Do not return database models through APIs or events; map to DTOs exposing only what clients need
- Do not expose implementation-specific types (e.g., MongoDB ObjectId) — use primitives or a UUID `displayId`
- For batch APIs where all operations must succeed or fail together, use JSON:API Atomic Operations
