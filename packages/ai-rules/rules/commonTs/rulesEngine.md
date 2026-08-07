---
description: "Writing or modifying @clipboard-health/rules-engine rule functions"
---

# Rules Engine

- Do not mutate instance or static variables inside `@clipboard-health/rules-engine` rule functions
- Do not perform side effects (DB writes, variable mutation) inside rules — pull side effects up to the caller
