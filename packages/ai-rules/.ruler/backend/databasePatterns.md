# Database Patterns

## MongoDB/Mongoose

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

**Aggregations:**

```typescript
const result = await Users.aggregate<ResultType>()
  .match({ active: true })
  .group({ _id: "$department", count: { $sum: 1 } })
  .project({ department: "$_id", count: 1 });
```

**Indexes:**

- Add only when needed (slower writes tradeoff)
- Apply via code only
- Separate `indexes.ts` from `schema.ts`
- Index definitions only in owning service
- Set `autoIndex: false`
- Design covering indexes for high-traffic queries

```text
models/User/
├── schema.ts    # Schema definition, schemaName, InferSchemaType
├── indexes.ts   # Index definitions only
├── types.ts     # Re-export types
└── index.ts     # Model creation and export
```

**Verify query plans:**

```typescript
const explanation = await ShiftModel.find(query).explain("executionStats");
// Check: totalDocsExamined ≈ totalDocsReturned
// Good: stage 'IXSCAN'; Bad: stage 'COLLSCAN'
```

**Transactions:**

```typescript
const session = await mongoose.startSession();
try {
  session.startTransaction();
  await Model.create([data], { session });
  await session.commitTransaction();
} catch (error) {
  await session.abortTransaction();
  throw error;
} finally {
  await session.endSession();
}
```

### Repository Pattern

```typescript
class UserRepo {
  // Named methods over generic CRUD
  async findById(request: { id: UserId }): Promise<UserDo> {}
  async findByEmail(request: { email: string }): Promise<UserDo> {}
  async updateEmail(request: { id: UserId; email: string }): Promise<UserDo> {}
}
```

## Postgres

- Avoid correlated subqueries that execute per-row; they can exhaust connection pools on high-traffic endpoints
- Put significant query changes (new joins, subqueries, query rewrites) behind a feature flag for gradual rollout and instant rollback
- For complex queries (joins, aggregations, conditional filtering), prefer Prisma TypedSQL over Prisma client methods
