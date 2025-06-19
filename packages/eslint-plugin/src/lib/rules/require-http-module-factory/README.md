# require-http-module-factory

ESLint rule to enforce the use of `HttpModule.registerAsync()` factory pattern instead of direct `HttpModule` imports from `@nestjs/axios`.

## Motivation

This rule prevents a critical production issue where shared axios clients cause interceptor conflicts across different services. When `HttpModule` is imported directly without using the factory pattern, it uses a static axios client that is globally shared. If multiple services add interceptors to this shared client, they can interfere with each other's HTTP requests.

### The Problem

Consider this problematic pattern:

```typescript
// ❌ BAD: Direct HttpModule import uses shared axios client
@Module({
  imports: [HttpModule], // This shares the global axios client
  providers: [SomeApiService],
})
export class SomeModule {}
```

If `SomeApiService` adds an interceptor (e.g., for authentication headers), it affects ALL services using the shared axios client, including:

- Other modules that import `HttpModule` directly
- Services like `BrazeClient` and `RadarApiClient` that use the static axios client

This can break unrelated HTTP requests across the entire application.

### The Solution

Use `HttpModule.registerAsync()` with a custom factory to create isolated axios instances:

```typescript
// ✅ GOOD: Factory pattern creates isolated axios client
@Module({
  imports: [
    HttpModule.registerAsync({
      useFactory: () => ({
        baseURL: "https://api.example.com",
        timeout: 5000,
      }),
    }),
  ],
  providers: [SomeApiService],
})
export class SomeModule {}
```

Each module gets its own axios client instance, preventing interceptor conflicts.

## Rule Details

This rule detects when `HttpModule` from `@nestjs/axios` is used directly in a module's `imports` array and reports an error.

### Examples

#### ❌ Incorrect

```typescript
import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";

@Module({
  imports: [HttpModule], // Error: Direct HttpModule import
})
export class BadModule {}
```

```typescript
import { HttpModule as NestHttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";

@Module({
  imports: [NestHttpModule], // Error: Direct import with alias
})
export class BadModule {}
```

#### ✅ Correct

```typescript
import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";

@Module({
  imports: [
    HttpModule.registerAsync({
      useFactory: () => ({ baseURL: "https://api.example.com" }),
    }),
  ],
})
export class GoodModule {}
```

```typescript
import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Module({
  imports: [
    HttpModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        baseURL: configService.get("API_BASE_URL"),
        timeout: configService.get("HTTP_TIMEOUT"),
      }),
    }),
  ],
})
export class GoodModule {}
```

```typescript
import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";

@Module({
  imports: [],
  providers: [HttpModule], // OK: HttpModule in providers array is allowed
})
export class AlsoGoodModule {}
```

## Configuration

This rule is automatically applied to all `*.module.ts` files when using `@clipboard-health/eslint-config`.

## When to Disable

This rule should generally not be disabled. If you have a legitimate use case for direct `HttpModule` imports, consider:

1. Whether you actually need HTTP functionality (maybe you don't need `HttpModule` at all)
2. Whether you can refactor to use the factory pattern
3. Whether your use case is in a provider array (which is allowed)

If you must disable the rule, use ESLint disable comments sparingly:

```typescript
// eslint-disable-next-line @clipboard-health/require-http-module-factory
imports: [HttpModule],
```

## Related

- [NestJS HttpModule Documentation](https://docs.nestjs.com/techniques/http-module)
- [Axios Interceptors Documentation](https://axios-http.com/docs/interceptors)
