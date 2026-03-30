---
name: domain-types
description: Use when creating or modifying TypeScript types, interfaces, domain objects (DOs), DTO mappers, DAO mappers, or Zod schemas in the three-tier architecture. Covers new entity creation and modifications to existing type files.
---

# Domain Types

Guide for designing types across the three-tier architecture (Entrypoint -> Logic -> Data). Read this before creating or modifying any DO, DTO, DAO, mapper, or Zod schema.

## The Mental Model

Three type layers exist, each with a clear boundary:

- **Domain Objects (DOs)** — The business truth. Pure TypeScript interfaces. No HTTP, no database. Lives in `logic/`. If you're describing shifts, workers, charges — you're describing DOs.
- **DTOs (via Zod schemas)** — The API boundary. What consumers send and receive. Lives in `contract-<service>` packages. Knows about JSON:API structure, ISO string dates, serialization. Does NOT contain business logic or database details.
- **DAOs (database models)** — What the database stores. Mongoose schemas, ObjectIds, embedded documents. Lives in `models/` and `data/`. Never escapes the repository layer.
- **Mappers** — Translators between layers. DTO mappers live at the entrypoint, DAO mappers live in repositories. They convert data shape, not behavior.

## Where Each Type Lives

| Type       | Location                                                                     | Knows About                     | Never Knows About         |
| ---------- | ---------------------------------------------------------------------------- | ------------------------------- | ------------------------- |
| DO         | `src/modules/<domain>/logic/<entity>.do.ts`                                  | Business concepts, domain rules | ObjectIds, JSON:API, HTTP |
| DTO        | `packages/contract-<service>/src/lib/contracts/<domain>/`                    | API shape, serialization        | Database, business rules  |
| DAO        | `src/models/`, `src/modules/<domain>/data/`                                  | Storage, indexes, queries       | API shape, HTTP, JSON:API |
| DTO Mapper | `src/modules/<domain>/entrypoints/<entity>.dto.mapper.ts`                    | DO <-> DTO conversion           | Database, business logic  |
| DAO Mapper | Private method in repository (or `data/<entity>.dao.mapper.ts` if >20 lines) | DAO <-> DO conversion           | API shape, business logic |

## Naming Conventions

- DO interfaces: `<Entity>Do` suffix — `ShiftDo`, `WorkplaceAgreementDo`
- Nested DOs: `<Parent><Sub>Do` — `ShiftWorkplaceDo`, `ShiftScheduleDo`
- DO files: `<entity>.do.ts` — `shift.do.ts`
- DTO mapper functions: `to<Entity>Do()` (request->DO), `to<Entity>Dto()` (DO->response)
- DAO mapper functions: `to<Entity>Do()` (DAO->DO), usually private in repository
- Repository methods: `findBy<Field>()` (single), `listBy<Field>()` (multiple)
- Branded IDs: `<Entity>Id` — `ShiftId`, `WorkplaceId`

## DO Design Rules

```typescript
// Domain-specific branded ID — defined in the .do.ts file
export const WorkplaceAgreementIdSchema = ObjectIdSchema.brand("WorkplaceAgreementId");
export type WorkplaceAgreementId = z.infer<typeof WorkplaceAgreementIdSchema>;

// Shared IDs (WorkplaceId, WorkerId, etc.) — reuse from src/schemas/index.ts

// DO interface
export interface WorkplaceAgreementDo {
  readonly id: WorkplaceAgreementId; // Branded, not bare string
  readonly workplace: WorkplaceAgreementWorkplaceDo; // Nested DO, not ObjectId
  readonly agreementType: AgreementType;
  readonly schedule: {
    // Inline OK for 2-3 fields
    readonly startAt: Date; // Date objects, not ISO strings
    readonly endAt: Date;
  };
  readonly paymentTerms: PaymentTermsDo; // Extract when >3 fields
  readonly autoRenew: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// Specialized subtypes for operations
export type CreateWorkplaceAgreementDo = Pick<
  WorkplaceAgreementDo,
  "workplace" | "agreementType" | "schedule" | "paymentTerms" | "autoRenew"
>;
```

Key rules:

- `readonly` on properties AND arrays (`readonly tags: readonly TagDo[]`)
- `Date` objects for dates (never ISO strings — that's the DTO's job)
- Branded types for IDs (never bare `string`)
- Named interfaces for nested objects with >3 fields
- No database types (`ObjectId`, `Document`), no HTTP types, no JSON:API structure
- No default values — defaults belong in DAO mappers or service layer

## Mapper Design Rules

Mappers are pure functions that transform data shape. No side effects, no business decisions.

```typescript
// DTO Mapper — entrypoints/<entity>.dto.mapper.ts
export function toWorkplaceAgreementDo(dto: CreateRequestDto["data"]): CreateWorkplaceAgreementDo {
  return {
    workplace: { id: dto.relationships.workplace.data.id },
    agreementType: dto.attributes.agreementType,
    schedule: {
      startAt: new Date(dto.attributes.startAt), // ISO string -> Date
      endAt: new Date(dto.attributes.endAt),
    },
    // ...
  };
}

export function toWorkplaceAgreementDto(agreement: WorkplaceAgreementDo): ResponseDto["data"] {
  return {
    type: API_TYPES.workplaceAgreement, // Singular, not plural
    id: agreement.id,
    attributes: {
      agreementType: agreement.agreementType,
      startAt: agreement.schedule.startAt.toISOString(), // Date -> ISO string
      // ...
    },
    relationships: {
      workplace: {
        data: { type: API_TYPES.workplace, id: agreement.workplace.id },
      },
    },
  };
}
```

Key rules:

- Use `isDefined()` for optional fields, never truthy checks
- Date conversion: `new Date(isoString)` in request mappers, `.toISOString()` in response mappers
- No `if` statements that make business decisions — only optional field presence checks
- Throw on data integrity violations (bad data = bug, not user error). Don't use `ServiceResult` in mappers.
- **Exception for `as` in DAO mappers:** Branded ID conversion (e.g., `dao._id.toString() as ShiftId`) is the one accepted use of type assertion, since there's no runtime Zod parse at the data boundary. Keep `as` limited to ID branding in mappers only.

## Type-Relevant Zod Patterns

For type design specifically (defer to `json-api-endpoint` for API structure):

- **Branded IDs:** `ObjectIdSchema.brand("ShiftId")` with `type ShiftId = z.infer<typeof ShiftIdSchema>`
- **Type inference:** Always `z.infer<typeof Schema>` — never duplicate a type a schema already defines
- **Schema composition:** Extract reusable sub-schemas to stay DRY
- **Dates:** Use `dateTimeSchema()` helper, not `z.coerce.date()` or `z.string().datetime()` directly
- **Enums:** Use `requiredEnumWithFallback()` / `optionalEnumWithFallback()` for forward compatibility

## Common Mistakes

1. **Passing Mongoose documents to services** — Services only see DOs. The repository converts via DAO mapper before returning.
2. **JSON:API structure in DOs** — If your DO has `type`, `attributes`, or `relationships` keys, you've leaked the API format.
3. **Business logic in mappers** — An `if` that determines behavior (not field presence) belongs in the service.
4. **Bare `string` for IDs** — Use branded types. `workplaceId: WorkplaceId` catches bugs at compile time.
5. **Skipping the DO layer** — Passing DTOs to repositories or returning DAOs from services creates tight coupling.
6. **`z.coerce.date()` in contracts** — Use `dateTimeSchema()` to stay consistent across the codebase.
7. **Plural JSON:API type names** — Use singular: `"shift"`, `"workplace"`, `"workplaceAgreement"`.
8. **Generic mapper names** — `toDomain()` / `toApiResponse()` don't follow convention. Use `to<Entity>Do()` / `to<Entity>Dto()`.
9. **Mappers in wrong directory** — DTO mappers go in `entrypoints/`, DAO mappers go in `data/` or as private repository methods.
10. **Database defaults in DOs** — `metadata ?? {}` belongs in the DAO mapper, not the DO definition.

## When NOT to Use Three-Tier Types

- **Internal utilities** — A date formatter doesn't need a DO.
- **Simple value types** — `type TimeSlot = "am" | "pm" | "noc"` doesn't need its own `.do.ts`. Define where used.
- **One-off results** — A repo returning a count doesn't need a DO wrapper. `Promise<number>` is fine.
- **Shared constants** — Config values, feature flag keys aren't domain objects.

**Over-engineering signals:**

- DO mirrors DAO 1:1 with zero transformation (still usually worth keeping for boundary, but question it)
- Mapper is just `return { ...input }`
- Result wrappers around a single array with no pagination metadata

**Under-engineering signals:**

- Service imports from `mongoose` or `@nestjs/mongoose`
- Controller constructs MongoDB filters
- DTO uses `Date` instead of ISO string
- Repository returns `any` or untyped objects

## Checklist

### New Entity

- [ ] DO at `logic/<entity>.do.ts` with `<Entity>Do` interface
- [ ] Branded ID (`ObjectIdSchema.brand("EntityId")`) — check `src/schemas/index.ts` for shared IDs first
- [ ] `readonly` on properties and arrays
- [ ] DTO mapper at `entrypoints/<entity>.dto.mapper.ts` — `to<Entity>Do()` and `to<Entity>Dto()`
- [ ] DAO mapper as private repo method (or `data/<entity>.dao.mapper.ts` if complex)
- [ ] Repository at `data/<entity>.repo.ts` with `findBy*`/`listBy*` naming
- [ ] Filter/query interfaces as DOs, not storage-specific types
- [ ] Creation/update subtypes via `Pick`, `PickDeep`, or `Omit`

### Modifying Existing

- [ ] Change propagated through all layers (DO -> mappers -> contract schema)
- [ ] New optional fields use `isDefined()` in mappers
- [ ] Mapper tests updated for new fields

### Always

- [ ] No `any`, `unknown` without justification, or type assertions (`as`, `!`)
- [ ] Dates: `Date` in DOs, ISO strings in DTOs, `dateTimeSchema()` in Zod
- [ ] IDs: branded types, not bare `string`
- [ ] Nested objects >3 fields extracted to named interfaces
- [ ] No database types leaking into DO or DTO layers
- [ ] No business logic in mappers
