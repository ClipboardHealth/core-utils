# MongoDB/Mongoose

**ObjectId:**

```typescript
import mongoose, { Types, Schema } from "mongoose";

const id = new Types.ObjectId();

// In schemas
const schema = new Schema({
  authorId: { type: Schema.Types.ObjectId, ref: "User" },
});

// In interfaces
interface Post {
  authorId: Types.ObjectId;
}

// Validation
if (mongoose.isObjectIdOrHexString(value)) {
}
```

**File Structure:**

```text
models/User/
├── schema.ts    # Schema definition, schemaName, InferSchemaType
├── indexes.ts   # Index definitions only
├── types.ts     # Re-export types
└── index.ts     # Model creation and export
```

- Set `autoIndex: false` in schema options
- App code must import models from `index.ts` only; `indexes.ts` must only be referenced by `sync-indexes.ts`
- Define indexes only in the service owning the MongoDB database
- Apply index changes via code (sync-indexes), not Atlas, Compass, or manual tools
- When adding a new collection or first index, add explicit imports of the model module and `indexes.ts` to `sync-indexes.ts` and test `test-context.ts`
- Do not run `createCollection` in a migration for a new collection; define the model and let collection auto-create

**Index PRs:**

- Index PRs must be self-contained with no unrelated app code changes; each PR must contain only creations or only deletions
- Verify an index is fully built before using `.hint()`; cancel in-progress background builds when reverting index PRs
- Request Platform team review for index change PRs; mark Platform as code owners for index files

**Verify query plans:**

```typescript
const explanation = await ShiftModel.find(query).explain("executionStats");
// Check: totalDocsExamined ≈ totalDocsReturned
// Good: stage 'IXSCAN'; Bad: stage 'COLLSCAN'
```

Run `explain("executionStats")` on new or changed queries; verify `$lookup` stages show `indexesUsed`; include explain output in the PR; test against production-sized data volumes.

## Compound Index Design

- Order compound index fields using ESR: equality fields first, sort fields, then range fields
- Ensure every `$lookup` has an index on the target `foreignField`
- Do not create single-field indexes that duplicate the leading field of an existing compound index
- Design covering indexes for high-traffic queries

## Query Patterns

- Use `$exists: true` to check field presence (matches even if value is `null`); use `$ne: null` to check field is present and not `null`; use `$eq: null` to match missing or explicitly `null` fields; combining `$exists: true` with `$ne: null` is valid but redundant since `$ne: null` already excludes missing and null fields
- Include partial/sparse index constraints in queries that rely on those indexes
- Avoid `$expr` in `$lookup` pipelines except for simple comparisons (`$eq`, `$lt`, `$lte`, `$gt`, `$gte`)
- Limit `$in` to tens of values

## Transactions

- Do not use parallel promise execution (`Promise.all`, `Promise.allSettled`, `Promise.race`) inside a MongoDB transaction
- For atomic operations: include both reads and writes in the same transaction, pass the session explicitly to downstream functions, commit/abort in try/catch, and call `session.endSession()` in `finally`

## Batch Migrations

Migrate large datasets in batches via background jobs using a cursor pattern (each job processes a batch and schedules the next); add 1-5s delay between batches; use the slow job group.

## Repository Pattern

```typescript
class UserRepo {
  // Named methods over generic CRUD
  async findById(request: { id: UserId }): Promise<UserDo> {}
  async findByEmail(request: { email: string }): Promise<UserDo> {}
  async updateEmail(request: { id: UserId; email: string }): Promise<UserDo> {}
}
```
