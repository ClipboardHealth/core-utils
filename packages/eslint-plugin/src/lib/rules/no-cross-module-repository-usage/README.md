## no-cross-module-repository-usage

This ESLint rule prevents cross-module repository usage in NestJS applications to enforce proper architectural boundaries.

### Rule Details

This rule enforces one main requirement:

1. **No Repository Exports**: NestJS modules should not export repository classes in their `exports` array

### Examples

#### ❌ Incorrect

```typescript
// In some.module.ts - exporting repository
@Module({
  providers: [SomeRepository],
  exports: [SomeRepository], // ❌ Should not export repository
})
export class SomeModule {}

// In different-module.service.ts - using repository from different module
import { SomeRepository } from "../some-module/some.repository";

@Injectable()
export class DifferentModuleService {
  constructor(
    private readonly someRepository: SomeRepository, // ❌ Cross-module repository usage
  ) {}
}

// Using @Inject decorator
@Injectable()
export class AnotherService {
  constructor(
    @Inject(SomeRepository) // ❌ Cross-module repository injection
    private readonly someRepository: SomeRepository,
  ) {}
}
```

#### ✅ Correct

```typescript
// In some.module.ts - not exporting repository
@Module({
  providers: [SomeService, SomeRepository],
  exports: [SomeService], // ✅ Export service instead
})
export class SomeModule {}
```

### Repository Detection

The rule identifies repository classes by:

- Class names ending in "Repository"
- Class names ending in "Repo"

### Scope

This rule currently focuses on preventing repository exports from NestJS modules. Future versions may include detection of cross-module repository usage patterns.

### When Not To Use

This rule should be disabled if your architecture intentionally allows cross-module repository access.
