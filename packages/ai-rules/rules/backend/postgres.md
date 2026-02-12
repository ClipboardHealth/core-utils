# Postgres

## Column Types

- Use `timestamptz` for all timestamp columns; annotate Prisma DateTime fields with `@db.Timestamptz()`
- Use `TEXT` for string columns
- Use `bigint` for numeric and UUIDv7 for string primary keys
- Do not use PostgreSQL reserved keywords for table, index, or column names

## Schema Changes

- Follow expand-and-contract for all database structure changes
- Isolate database migrations and schema changes in separate PRs from business logic; verify migrations applied in all environments before merging follow-up PRs
- Normalize to at least 3NF; do not use array columns when data should be normalized

## Query Patterns

- Avoid correlated subqueries that execute per-row; they can exhaust connection pools on high-traffic endpoints
- Put significant query changes (new joins, subqueries, query rewrites) behind a feature flag for gradual rollout and instant rollback
- For complex queries (joins, aggregations, conditional filtering), prefer Prisma TypedSQL over Prisma client methods
- Include the current-state condition in UPDATE WHERE clauses instead of read-then-check-then-update
- Avoid read-modify-write cycles using single-call updates, SELECT FOR UPDATE, SERIALIZABLE transactions, or optimistic concurrency

## Configuration

- Avoid JSON/JSONB columns (prefer typed columns)
- Set connection pool max to 10-15 unless proven need
- Verify indexes with EXPLAIN ANALYZE before adding
