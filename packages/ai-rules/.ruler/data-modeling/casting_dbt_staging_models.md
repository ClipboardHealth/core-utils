# Casting data-types for staging models
1. Use declared schemas when available
Always cast explicitly. Never rely on implicit types.
2. If everything is VARCHAR, infer from values, not names
Inference order:
JSON → TIMESTAMP → DATE → INTEGER → FLOAT → BOOLEAN → STRING
3. Prefer TRY_CAST over CAST
Only cast when >95% of values match or safe to fail null.
4. Normalize nulls
Convert empty strings and known garbage values (NULL, N/A, -) to null.
5. Never infer types from column names alone
(id, status, amount, etc. are not type evidence).
6. Preserve raw when casting is risky
Add _raw column if transformation is lossy or unreliable.
7. Flag high cast failure rates (>5–10%)
Leave as STRING and add comment.
