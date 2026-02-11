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

## URLs

```text
GET /urgent-shifts                    # lowercase kebab-case, plural nouns
GET /workers/:workerId/shifts
POST /workers/:workerId/referral-codes
```

## HTTP Conventions

- No PUT support — use PATCH for updates
- POST returns the created resource DTO
- 422 for unsupported filters/sorts (not 400)

## Filtering, Sorting, Pagination

```text
GET /shifts?filter[verified]=true&sort=startDate,-urgency&page[cursor]=abc&page[size]=50
```

- Cursor-based pagination only (not offset)
- Avoid count totals (performance)
- Only implement filters/sorts clients need

## Contracts

- Add contracts to `contract-<repo-name>` package
- Use `ts-rest` with composable Zod schemas
