# Postgres

- Avoid correlated subqueries that execute per-row; they can exhaust connection pools on high-traffic endpoints
- Put significant query changes (new joins, subqueries, query rewrites) behind a feature flag for gradual rollout and instant rollback
- For complex queries (joins, aggregations, conditional filtering), prefer Prisma TypedSQL over Prisma client methods
