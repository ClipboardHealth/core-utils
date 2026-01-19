# Architecture

## Three-Tier Architecture

All NestJS microservices follow a three-tier layered architecture:

```text
┌─────────────────────────────────────────────────────────────────┐
│  Entrypoints (Controllers, message consumers)                   │
│  - HTTP request/response, JSON:API DTO translation, auth        │
├─────────────────────────────────────────────────────────────────┤
│  Logic (NestJS services, message publishers, background jobs)   │
│  - ALL business logic; works with DOs only                      │
│  - Knows nothing about HTTP or database specifics               │
├─────────────────────────────────────────────────────────────────┤
│  Data (Data repositories, gateways)                             │
│  - Database via ORM (Prisma/Mongoose), DAO ↔ DO translation     │
│  - External service integrations (Gateways)                     │
└─────────────────────────────────────────────────────────────────┘
```

**Module Structure:**

```text
modules/
└── example/
    ├── data/
    │   ├── example.dao.mapper.ts
    │   ├── example.repo.ts
    │   └── notification.gateway.ts
    ├── entrypoints/
    │   ├── example.controller.ts
    │   ├── example.consumer.ts
    │   └── example.dto.mapper.ts
    ├── logic/
    │   ├── jobs/
    │   │   └── exampleCreated.job.ts
    │   ├── example.do.ts
    │   └── example.service.ts
    └── example.module.ts
```

**File Patterns:**

```text
*.controller.ts  - HTTP controllers (entrypoints)
*.consumer.ts    - Message consumers (entrypoints)
*.service.ts     - Business logic (logic)
*.job.ts         - Background jobs (logic)
*.repo.ts        - Database access (data)
*.gateway.ts     - External services (data)
*.do.ts          - Domain objects
*.dto.mapper.ts  - DTO transformation
*.dao.mapper.ts  - DAO transformation
```

**Tier Rules:**

- Controllers → Services (never repos directly)
- Services → Repos/Gateways within module (never controllers)
- Repos → Database only (never services/repos/controllers)
- Entry points are thin layers calling services
- Enforce with `dependency-cruiser`

**Microservices Principles:**

- One domain = one module (bounded contexts)
- Specific modules know about generic, not vice versa
- Don't block Node.js thread—use background jobs for expensive operations
