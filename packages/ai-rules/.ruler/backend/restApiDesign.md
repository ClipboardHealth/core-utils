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

## HTTP Methods

| Method | Usage                              |
| ------ | ---------------------------------- |
| GET    | Retrieve (idempotent)              |
| POST   | Create single resource, return DTO |
| PATCH  | Update, return updated resource    |
| DELETE | Remove                             |
| PUT    | Not supported                      |

## HTTP Status Codes

| Code | Meaning                                                 |
| ---- | ------------------------------------------------------- |
| 200  | OK (GET, PATCH, DELETE)                                 |
| 201  | Created (POST)                                          |
| 202  | Accepted (async started)                                |
| 400  | Bad Request (syntax error)                              |
| 401  | Unauthorized (auth failed)                              |
| 403  | Forbidden (authz failed)                                |
| 404  | Not Found                                               |
| 409  | Conflict (already exists)                               |
| 422  | Unprocessable (semantic error, unsupported filter/sort) |
| 429  | Rate limited                                            |
| 500  | Server error                                            |

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
