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

## Module Organization

- Define one NestJS module per folder at `src/modules/` root (no nesting)
- List only owned providers/controllers/exports in `@Module`; import the module that exports a service rather than providing it directly
- Use dependency-cruiser to enforce tiered architecture constraints
- When joining across DB tables, do not join on tables owned by another module — fetch via the owning module's service instead

**`ts-rest` contracts:**

```text
packages/contract-<service>/src/
├── index.ts
└── lib
    ├── constants.ts
    └── contracts
        ├── contract.ts
        ├── health.contract.ts
        ├── index.ts
        └── user
            ├── index.ts
            ├── user.contract.ts
            └── shared.ts
```

**NestJS microservice modules:**

```text
 src/modules/user
 ├── user.module.ts
 ├── data
 │   ├── user.dao.mapper.ts
 │   └── user.repo.ts
 ├── entrypoints
 │   ├── user.controller.ts
 │   ├── user.dto.mapper.ts
 │   └── userCreated.consumer.ts
 └── logic
     ├── user.do.ts
     ├── user.service.ts
     ├── userCreated.service.ts
     └── jobs
         ├── user.job.mapper.ts
         ├── userCreated.job.spec.ts
         └── userCreated.job.ts
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

## Repository Naming

- Name repo methods `findBy*` (single) and `listBy*` (multiple) with meaningful names (not generic CRUD)
- Expose storage-decoupled filter params; split modules/services/repos by operation as complexity grows

## Microservices Principles

- One domain = one module (bounded contexts)
- Specific modules know about generic, not vice versa
- Don't block Node.js thread—use background jobs for expensive operations
- Isolate resource-intensive jobs in dedicated ECS tasks
