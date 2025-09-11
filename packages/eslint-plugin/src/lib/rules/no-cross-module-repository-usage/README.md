## no-cross-module-repository-usage

This ESLint rule prevents cross-module repository usage in NestJS applications to enforce proper architectural boundaries.

### Rule Details

This rule enforces two main requirements:

1. **No Repository Exports**: NestJS modules should not export repository classes in their `exports` array
2. **No Cross-Module Repository Usage**: Classes should not import or inject repository classes from different modules

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

// In some.service.ts - using repository within same module
@Injectable()
export class SomeService {
  constructor(
    private readonly someRepository: SomeRepository, // ✅ Same module usage
  ) {}
}
```

### Repository Detection

The rule identifies repository classes by:

- Class names ending in "Repository"
- Class names containing "Repo"
- Files ending in ".repo.ts" or ".repository.ts"

### Module Boundary Detection

The rule determines module boundaries by analyzing `@Module` decorator's `providers` array rather than directory structure. This ensures accurate detection of which repositories belong to each module.

### When Not To Use

This rule should be disabled if your architecture intentionally allows cross-module repository access.
