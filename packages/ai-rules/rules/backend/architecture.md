---
description: "Structuring NestJS modules, services, repos: three-tier, microservices, ts-rest contracts"
---

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
│  - Can depend on other modules' logic (cross-module composition)│
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

**`ts-rest` contracts** live in `packages/contract-<service>/src/lib/`, with `constants.ts` at that level and one directory per resource under `contracts/`:

```text
contracts/
├── contract.ts            # Root router composing every resource contract
├── health.contract.ts     # Every service has one
├── index.ts
└── user/
    ├── index.ts
    ├── user.contract.ts
    └── shared.ts          # Schemas shared within this resource
```

**NestJS modules** live at `src/modules/<domain>/`, containing `<domain>.module.ts` plus `entrypoints/`, `logic/`, and `data/`; background jobs go under `logic/jobs/`.

**File suffixes:** `*.controller.ts` and `*.consumer.ts` are entrypoints; `*.service.ts` and `*.job.ts` are logic; `*.repo.ts` and `*.gateway.ts` are data. `*.do.ts` is a domain object; `*.dto.mapper.ts`, `*.dao.mapper.ts`, and `*.job.mapper.ts` are the translations at each boundary. Backend tests use the `.spec.ts` suffix and sit next to the file they cover.

## Repository Naming

- Name repo methods `findBy*` (single) and `listBy*` (multiple) with meaningful names (not generic CRUD)
- Expose storage-decoupled filter params; split modules/services/repos by operation as complexity grows

## Microservices Principles

- One domain = one module (bounded contexts)
- Specific modules know about generic, not vice versa
- Don't block Node.js thread—use background jobs for expensive operations
- Isolate resource-intensive jobs in dedicated ECS tasks
