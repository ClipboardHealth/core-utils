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

// Regular parameter with @Inject decorator
@Injectable()
export class YetAnotherService {
  constructor(
    @Inject(SomeRepository) someRepo: SomeRepository, // ❌ Cross-module repository injection
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

// In same-module.service.ts - using repository from same module
import { SomeRepository } from "./some.repository";

@Injectable()
export class SameModuleService {
  constructor(
    private readonly someRepository: SomeRepository, // ✅ Same-module repository usage
  ) {}
}
```

### Repository Detection

The rule identifies repository classes by:

- Class names ending in "Repository"
- Class names ending in "Repo"

### Module Boundary Detection

The rule determines module boundaries by analyzing file paths and import patterns:

- Files containing `@Module` decorators are treated as module files
- Cross-module detection is based on relative import paths and directory structure
- Same-directory imports (starting with `./`) are considered same-module
- Parent directory imports (starting with `../`) are analyzed for module boundaries

### Import Path Analysis

The rule identifies repository imports by checking:

- File paths ending in `.repository.ts` or `.repo.ts`
- Import paths containing "repository" or "repositories" segments
- Basename of files ending with ".repository" or ".repo"

### Constructor Parameter Patterns

The rule handles all injection patterns:

- TypeScript parameter properties with type annotations
- Regular parameters with `@Inject` decorators
- Both private/public/protected parameter properties

### When Not To Use

This rule should be disabled if your architecture intentionally allows cross-module repository access.
