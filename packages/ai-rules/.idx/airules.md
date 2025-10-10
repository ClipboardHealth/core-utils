

<!-- Source: .ruler/backend/nestJsApis.md -->

# NestJS APIs

- Use a three-tier architecture:
  - Controllers in the entrypoints tier translate from data transfer objects (DTOs) to domain objects (DOs) and call the logic tier.
  - Logic tier services call other services in the logic tier and repos and gateways at the data tier. The logic tier operates only on DOs.
  - Data tier repos translate from DOs to data access objects (DAOs), call the database using either Prisma for Postgres or Mongoose for MongoDB, and then translate from DAOs to DOs before returning to the logic tier.
- Use ts-rest to define contracts using Zod schemas, one contract per resource.
- A controller implements each ts-rest contract.
- Requests and responses follow the JSON:API specification, including pagination for listings.
- Use TypeDoc to document public functions, classes, methods, and complex code blocks.



<!-- Source: .ruler/common/codeStyleAndStructure.md -->

# Code style and structure

- Write concise, technical TypeScript code with accurate examples.
- Use functional and declarative programming patterns.
- Prefer iteration and modularization over code duplication.
- Use descriptive variable names with auxiliary verbs (e.g., isLoading, hasError).
- Structure files: constants, types, exported functions, non-exported functions.
- Avoid magic strings and numbers; define constants.
- Use camelCase for files and directories (e.g., modules/shiftOffers.ts).
- When declaring functions, use the `function` keyword, not `const`.
- Prefer data immutability.



<!-- Source: .ruler/common/errorHandlingAndValidation.md -->

# Error handling and validation

- Sanitize user input.
- Handle errors and edge cases at the beginning of functions.
- Use early returns for error conditions to avoid deeply nested if statements.
- Place the happy path last in the function for improved readability.
- Avoid unnecessary else statements; use the if-return pattern instead.
- Use guard clauses to handle preconditions and invalid states early.
- Implement proper error logging and user-friendly error messages.
- Favor `@clipboard-health/util-ts`'s `Either` type for expected errors instead of `try`/`catch`.



<!-- Source: .ruler/common/keyConventions.md -->

# Key conventions

- You are familiar with the latest features and best practices.
- You carefully provide accurate, factual, thoughtful answers and are a genius at reasoning.
- You always write correct, up-to-date, bug-free, fully functional, working, secure, easy-to-read, and efficient code.
- If there might not be a correct answer or do not know the answer, say so instead of guessing.



<!-- Source: .ruler/common/testing.md -->

# Testing

- Follow the Arrange-Act-Assert convention for tests with newlines between each section.
- Name test variables using the `mockX`, `input`, `expected`, `actual` convention.
- Aim for high test coverage, writing both positive and negative test cases.
- Prefer `it.each` for multiple test cases.
- Avoid conditional logic in tests.



<!-- Source: .ruler/common/typeScript.md -->

# TypeScript usage

- Use strict-mode TypeScript for all code; prefer interfaces over types.
- Avoid enums; use const maps instead.
- Strive for precise types. Look for type definitions in the codebase and create your own if none exist.
- Avoid using type assertions like `as` or `!` unless absolutely necessary.
- Use the `unknown` type instead of `any` when the type is truly unknown.
- Use an object to pass multiple function params and to return results.
- Leverage union types, intersection types, and conditional types for complex type definitions.
- Use mapped types and utility types (e.g., `Partial<T>`, `Pick<T>`, `Omit<T>`) to transform existing types.
- Implement generic types to create reusable, flexible type definitions.
- Utilize the `keyof` operator and index access types for dynamic property access.
- Implement discriminated unions for type-safe handling of different object shapes where appropriate.
- Use the `infer` keyword in conditional types for type inference.
- Leverage `readonly` properties for function parameter immutability.
- Prefer narrow types whenever possible with `as const` assertions, `typeof`, `instanceof`, `satisfies`, and custom type guards.
- Implement exhaustiveness checking using `never`.



<!-- Source: .ruler/frontend/custom-hooks.md -->

# Custom Hook Standards

## Hook Structure

```typescript
interface UseFeatureOptions {
  enabled?: boolean;
  refetchInterval?: number;
}

export function useFeature(params: Params, options: UseFeatureOptions = {}) {
  const { enabled = true } = options;

  // Multiple queries/hooks
  const query1 = useQuery(...);
  const query2 = useQuery(...);

  // Derived state
  const computed = useMemo(() => {
    // Combine data
    return transformData(query1.data, query2.data);
  }, [query1.data, query2.data]);

  // Callbacks
  const handleAction = useCallback(async () => {
    // Perform action
  }, [dependencies]);

  // Return structured object
  return {
    // Data
    data: computed,

    // Loading states
    isLoading: query1.isLoading || query2.isLoading,
    isError: query1.isError || query2.isError,

    // Actions
    refetch: async () => {
      await Promise.all([query1.refetch(), query2.refetch()]);
    },
    handleAction,
  };
}
```

## Naming Rules

- **Always** prefix with `use`
- Boolean hooks: `useIsFeatureEnabled`, `useShouldShowModal`, `useHasPermission`
- Data hooks: `useGetData`, `useFeatureData`
- Action hooks: `useBookShift`, `useSubmitForm`

## Return Values

- Return objects (not arrays) for complex hooks
- Name properties clearly: `isLoading` not `loading`, `refetch` not `refresh`
- Group related properties together

```typescript
// Good - clear property names
return {
  data,
  isLoading,
  isError,
  refetch,
};

// Avoid - array destructuring for complex returns
return [data, isLoading, refetch]; // Only for very simple hooks
```

## State Management with Constate

For local/shared state management, use **`constate`** to create context with minimal boilerplate:

```typescript
import constate from "constate";
import { useState, useCallback } from "react";

// Define your hook with state logic
function useShiftFilters() {
  const [filters, setFilters] = useState<Filters>({});
  const [isLoading, setIsLoading] = useState(false);

  const applyFilters = useCallback((newFilters: Filters) => {
    setFilters(newFilters);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({});
  }, []);

  return {
    filters,
    isLoading,
    applyFilters,
    clearFilters,
  };
}

// Create provider and hook with constate
export const [ShiftFiltersProvider, useShiftFiltersContext] = constate(useShiftFilters);
```

**Usage:**

```typescript
// Wrap components that need access
function ShiftsPage() {
  return (
    <ShiftFiltersProvider>
      <ShiftList />
      <FilterPanel />
    </ShiftFiltersProvider>
  );
}

// Use in child components
function ShiftList() {
  const { filters, applyFilters } = useShiftFiltersContext();

  // Use shared state
  return <div>{/* ... */}</div>;
}
```

**Benefits:**

- Minimal boilerplate compared to raw Context API
- TypeScript support out of the box
- Avoids prop drilling
- Clean separation of state logic

**When to use Constate:**

- Sharing state between multiple sibling components
- Complex feature-level state (filters, UI state, form state)
- Alternative to prop drilling

**When NOT to use Constate:**

- Server state (use React Query instead)
- Global app state (consider if it's truly needed)
- Simple parent-child communication (use props)

## Boolean Hooks

```typescript
// Pattern: useIs*, useHas*, useShould*
export function useIsFeatureEnabled(): boolean {
  const flags = useFeatureFlags();
  return flags.includes("new-feature");
}

export function useHasPermission(permission: string): boolean {
  const user = useUser();
  return user.permissions.includes(permission);
}

export function useShouldShowModal(): boolean {
  const hasSeenModal = usePreference("hasSeenModal");
  return !hasSeenModal;
}
```

## Data Transformation Hooks

```typescript
export function useTransformedData() {
  const { data: rawData, isLoading, isError } = useGetRawData();

  const transformedData = useMemo(() => {
    if (!rawData) return undefined;

    return rawData.map((item) => ({
      ...item,
      displayName: formatName(item),
    }));
  }, [rawData]);

  return {
    data: transformedData,
    isLoading,
    isError,
  };
}
```

## Side Effect Hooks

```typescript
// Hooks that perform side effects (logging, tracking, etc.)
export function useTrackPageView(pageName: string) {
  useEffect(() => {
    logEvent("PAGE_VIEWED", { pageName });
  }, [pageName]);
}

// Usage
export function MyPage() {
  useTrackPageView("MyPage");
  // ... rest of component
}
```

## Composite Hooks

```typescript
// Combines multiple hooks and data sources
export function useWorkerBookingsData() {
  const worker = useDefinedWorker();
  const isFeatureEnabled = useIsFeatureEnabled("new-bookings");

  const {
    data: shifts,
    isLoading: isLoadingShifts,
    refetch: refetchShifts,
  } = useGetShifts(worker.id);

  const {
    data: invites,
    isLoading: isLoadingInvites,
    refetch: refetchInvites,
  } = useGetInvites(worker.id, { enabled: isFeatureEnabled });

  // Combine data
  const bookings = useMemo(() => {
    return [...(shifts ?? []), ...(invites ?? [])].sort(sortByDate);
  }, [shifts, invites]);

  // Combined loading state
  const isLoading = isLoadingShifts || isLoadingInvites;

  // Combined refetch
  async function refreshAllData() {
    await Promise.all([refetchShifts(), refetchInvites()]);
  }

  return {
    // Data
    bookings,

    // States
    isLoading,
    isFeatureEnabled,

    // Actions
    refreshAllData,
  };
}
```

## Co-location

- Place hooks in `hooks/` folder within feature directory
- Place API hooks in `api/` folder
- Keep generic/shared hooks in `lib/` or `utils/`

```
FeatureName/
├── api/
│   ├── useGetFeature.ts      # API data fetching
│   └── useUpdateFeature.ts
├── hooks/
│   ├── useFeatureLogic.ts    # Business logic hooks
│   ├── useFeatureState.ts    # Constate state hooks
│   └── useFeatureFilters.ts
└── components/
    └── FeatureComponent.tsx
```

## Options Pattern

```typescript
// Always use options object for flexibility
interface UseFeatureOptions {
  enabled?: boolean;
  refetchInterval?: number;
  onSuccess?: (data: Data) => void;
}

export function useFeature(params: Params, options: UseFeatureOptions = {}) {
  const { enabled = true, refetchInterval, onSuccess } = options;

  // Use options in queries
  return useQuery({
    enabled,
    refetchInterval,
    onSuccess,
    // ...
  });
}
```

## Hook Dependencies

```typescript
// Be explicit about dependencies
export function useFormattedData(rawData: Data[]) {
  return useMemo(() => {
    return rawData.map(format);
  }, [rawData]); // Clear dependency
}

// Avoid creating functions in dependency arrays
export function useHandler() {
  const [value, setValue] = useState();

  // Good - stable reference
  const handleChange = useCallback((newValue: string) => {
    setValue(newValue);
  }, []); // No dependencies on value

  return handleChange;
}
```

## Best Practices

- **Prefix with `use`** - Always
- **Return objects, not arrays** - For hooks with multiple values
- **Use constate for shared state** - Avoid prop drilling
- **API hooks in `api/`** - Logic hooks in `hooks/`
- **Clear property names** - `isLoading`, not `loading`
- **Options pattern** - For flexible configuration
- **Explicit dependencies** - In useMemo/useCallback



<!-- Source: .ruler/frontend/data-fetching.md -->

# Data Fetching Standards

## Technology Stack

- **React Query** (@tanstack/react-query) for all API calls
- **Axios** for HTTP requests
- **Zod** for response validation

## Core Principles

1. **Use URL and query parameters in query keys** - Makes cache invalidation predictable
2. **Always use `useGetQuery` hook** - Provides consistent structure, logging, and validation
3. **Define Zod schemas** for all API requests and responses
4. **Log errors with centralized constants** - From `APP_V2_APP_EVENTS`, never inline strings
5. **Rely on React Query state** - Use `isLoading`, `isError`, `isSuccess` - don't reinvent state management
6. **Use `enabled` for conditional fetching** - With `isDefined()` helper
7. **Use `invalidateQueries` for disabled queries** - Not `refetch()` which ignores enabled state

## Hook Patterns

### Simple Query

```typescript
export function useGetUser(userId: string) {
  return useGetQuery({
    url: `/api/users/${userId}`,
    responseSchema: userSchema,
    enabled: isDefined(userId),
    staleTime: minutesToMilliseconds(5),
    meta: {
      logErrorMessage: APP_V2_APP_EVENTS.GET_USER_FAILURE,
    },
  });
}
```

### Infinite/Paginated Query

```typescript
export function usePaginatedShifts(params: Params) {
  return useInfiniteQuery({
    queryKey: ["shifts", params],
    queryFn: async ({ pageParam }) => {
      const response = await get({
        url: "/api/shifts",
        queryParams: { cursor: pageParam, ...params },
        responseSchema: shiftsResponseSchema,
      });
      return response.data;
    },
    getNextPageParam: (lastPage) => lastPage.links.nextCursor,
  });
}
```

### Composite Data Fetching

```typescript
// Hook that combines multiple queries
export function useWorkerBookingsData() {
  const { data: shifts, refetch: refetchShifts } = useGetShifts();
  const { data: invites, refetch: refetchInvites } = useGetInvites();

  // Combine data
  const bookings = useMemo(() => {
    return [...(shifts ?? []), ...(invites ?? [])];
  }, [shifts, invites]);

  // Combine loading states
  const isLoading = shiftsQuery.isLoading || invitesQuery.isLoading;

  // Combine refetch functions
  async function refreshAllData() {
    await Promise.all([refetchShifts(), refetchInvites()]);
  }

  return {
    bookings,
    isLoading,
    refreshAllData,
  };
}
```

## Error Handling

Always use centralized error constants and handle expected errors gracefully:

```typescript
useGetQuery({
  url: "/api/resource",
  responseSchema: schema,
  meta: {
    logErrorMessage: APP_V2_APP_EVENTS.GET_RESOURCE_FAILURE, // ✅ Centralized
    userErrorMessage: "Failed to load data", // Shows alert to user
  },
  useErrorBoundary: (error) => {
    // Don't show error boundary for 404s (expected errors)
    return !(axios.isAxiosError(error) && error.response?.status === 404);
  },
  retry: (failureCount, error) => {
    // Don't retry 404s or 401s
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      return ![404, 401].includes(status ?? 0);
    }
    return failureCount < 3;
  },
});
```

## State Management - Don't Reinvent the Wheel

❌ **Don't** create your own loading/error state:

```typescript
const [data, setData] = useState();
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState();

useEffect(() => {
  async function fetchData() {
    try {
      setIsLoading(true);
      const result = await api.get("/data");
      setData(result);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }
  fetchData();
}, []);
```

✅ **Do** use React Query states:

```typescript
const { data, isLoading, isError, isSuccess } = useGetQuery({...});

if (isLoading) return <Loading />;
if (isError) return <Error />;
if (isSuccess) return <div>{data.property}</div>;
```

## Mutations

```typescript
export function useCreateDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateDocumentRequest) => {
      return await post({
        url: "/api/documents",
        data,
        responseSchema: documentSchema,
      });
    },
    onSuccess: () => {
      // Invalidate queries to refetch
      queryClient.invalidateQueries(["documents"]);
    },
    onError: (error) => {
      logEvent(APP_V2_APP_EVENTS.CREATE_DOCUMENT_FAILURE, { error });
    },
  });
}
```

## Query Keys

Always include URL and parameters in query keys:

```typescript
// ❌ Don't use static strings
useQuery({ queryKey: "users", ... });

// ✅ Do include URL and params
useQuery({ queryKey: [`/api/users?${status}`, { status }], ... });

// Consistent query key structure
export const queryKeys = {
  users: ["users"] as const,
  user: (id: string) => ["users", id] as const,
  userShifts: (id: string) => ["users", id, "shifts"] as const,
};

// Usage
useQuery({
  queryKey: queryKeys.user(userId),
  // ...
});
```

## Refetch Intervals

```typescript
useGetQuery({
  url: "/api/resource",
  responseSchema: schema,
  refetchInterval: (data) => {
    // Dynamic refetch based on data state
    if (!data?.isComplete) {
      return 1000; // Poll every second until complete
    }
    return 0; // Stop refetching
  },
});
```

## Conditional Fetching

Use `enabled` option with `isDefined()` helper:

```typescript
import { isDefined } from "@src/appV2/lib";

const { data } = useGetQuery({
  url: "/api/resource",
  responseSchema: schema,
  // Only fetch when conditions are met
  enabled: isDefined(userId) && isFeatureEnabled,
});
```

## Refetch vs InvalidateQueries

**Important:** For disabled queries, use `invalidateQueries` instead of `refetch`:

❌ **Don't** use `refetch()` on disabled queries:

```typescript
const { refetch, data } = useGetQuery({
  enabled: isDefined(shift.agentId),
  ...
});

// Will fetch even if agentId is undefined!
refetch();
```

✅ **Do** use `invalidateQueries`:

```typescript
const queryClient = useQueryClient();

const { data } = useGetQuery({
  enabled: isDefined(shift.agentId),
  ...
});

// Respects the enabled state
queryClient.invalidateQueries({ queryKey: [myQueryKey] });
```

## Query Cancellation

```typescript
export function usePaginatedData() {
  const queryClient = useQueryClient();

  return useInfiniteQuery({
    queryKey: ["data"],
    queryFn: async ({ pageParam }) => {
      // Cancel previous in-flight requests
      await queryClient.cancelQueries({ queryKey: ["data"] });

      const response = await get({
        url: "/api/data",
        queryParams: { cursor: pageParam },
      });
      return response.data;
    },
    // ...
  });
}
```

## Naming Conventions

- **useGet\*** - Simple queries: `useGetUser`, `useGetShift`
- **usePaginated\*** - Infinite queries: `usePaginatedPlacements`
- **useFetch\*** - Complex fetching logic: `useFetchPaginatedInterviews`
- **Mutations**: `useCreateDocument`, `useUpdateShift`, `useDeletePlacement`

## Response Transformation

```typescript
export function useGetUser(userId: string) {
  return useGetQuery({
    url: `/api/users/${userId}`,
    responseSchema: userResponseSchema,
    select: (data) => {
      // Transform response data
      return {
        ...data,
        fullName: `${data.firstName} ${data.lastName}`,
      };
    },
  });
}
```

## Hook Location

- **API hooks** → Place in `api/` folder within feature directory
- **One endpoint = one hook** principle
- Export types inferred from Zod: `export type User = z.infer<typeof userSchema>`

Example:

```
Feature/
├── api/
│   ├── useGetResource.ts
│   ├── useCreateResource.ts
│   └── schemas.ts  (optional)
```



<!-- Source: .ruler/frontend/error-handling.md -->

# Error Handling Standards

## React Query Error Handling

### Basic Error Configuration

```typescript
useGetQuery({
  url: "/api/resource",
  responseSchema: schema,
  meta: {
    logErrorMessage: APP_V2_APP_EVENTS.GET_RESOURCE_FAILURE,
  },
  useErrorBoundary: (error) => {
    // Show error boundary for 500s, not for 404s
    return !(axios.isAxiosError(error) && error.response?.status === 404);
  },
  retry: (failureCount, error) => {
    // Don't retry 404s or 401s
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      return ![404, 401].includes(status ?? 0);
    }
    return failureCount < 3;
  },
});
```

### Error Boundary Strategy

- **Show error boundary** for unexpected errors (500s, network failures)
- **Don't show error boundary** for expected errors (404s, validation errors)
- Use `useErrorBoundary` to control this behavior

```typescript
useErrorBoundary: (error) => {
  // Only show error boundary for server errors
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    return status !== undefined && status >= 500;
  }
  return true; // Show for non-Axios errors
};
```

### Retry Configuration

```typescript
// Don't retry client errors
retry: (failureCount, error) => {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    // Don't retry 4xx errors
    if (status !== undefined && status >= 400 && status < 500) {
      return false;
    }
  }
  // Retry server errors up to 3 times
  return failureCount < 3;
};
```

### Exponential Backoff

```typescript
import { type QueryClient } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: (attemptIndex) => {
        // Exponential backoff: 1s, 2s, 4s
        return Math.min(1000 * 2 ** attemptIndex, 30000);
      },
    },
  },
});
```

## Component Error States

### Pattern: Loading → Error → Success

```typescript
export function DataComponent() {
  const { data, isLoading, isError, error, refetch } = useGetData();

  if (isLoading) {
    return <LoadingState />;
  }

  if (isError) {
    return <ErrorState message="Failed to load data" onRetry={refetch} error={error} />;
  }

  // Happy path
  return <DataDisplay data={data} />;
}
```

### Inline Error Messages

```typescript
export function FormComponent() {
  const mutation = useCreateResource();

  return (
    <form onSubmit={handleSubmit}>
      {mutation.isError && <Alert severity="error">Failed to save. Please try again.</Alert>}

      <Button type="submit" loading={mutation.isLoading} disabled={mutation.isLoading}>
        Save
      </Button>
    </form>
  );
}
```

### Graceful Degradation

```typescript
export function OptionalDataComponent() {
  const { data, isError } = useGetOptionalData();

  // Don't block UI for optional data
  if (isError) {
    logError("Failed to load optional data");
    return null; // or show simplified version
  }

  if (!data) {
    return null;
  }

  return <EnhancedView data={data} />;
}
```

## Mutation Error Handling

### onError Callback

```typescript
export function useCreateDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createDocumentApi,
    onSuccess: (data) => {
      queryClient.invalidateQueries(["documents"]);
      showSuccessToast("Document created");
    },
    onError: (error) => {
      logEvent(APP_V2_APP_EVENTS.CREATE_DOCUMENT_FAILURE, {
        error: error.message,
      });
      showErrorToast("Failed to create document");
    },
  });
}
```

### Handling Specific Errors

```typescript
export function useUpdateProfile() {
  return useMutation({
    mutationFn: updateProfileApi,
    onError: (error: AxiosError) => {
      if (error.response?.status === 409) {
        showErrorToast("Email already exists");
      } else if (error.response?.status === 422) {
        showErrorToast("Invalid data provided");
      } else {
        showErrorToast("Failed to update profile");
      }
    },
  });
}
```

## Logging and Monitoring

### Event Logging

```typescript
import { logEvent } from '@src/appV2/lib/analytics';
import { APP_V2_APP_EVENTS } from '@src/appV2/lib/events';

// In query configuration
meta: {
  logErrorMessage: APP_V2_APP_EVENTS.GET_SHIFTS_FAILURE,
}

// In error handlers
onError: (error) => {
  logEvent(APP_V2_APP_EVENTS.BOOKING_FAILED, {
    shiftId,
    error: error.message,
    userId: worker.id,
  });
}
```

### Error Context

Always include relevant context when logging errors:

```typescript
logEvent(APP_V2_APP_EVENTS.API_ERROR, {
  endpoint: "/api/shifts",
  method: "GET",
  statusCode: error.response?.status,
  errorMessage: error.message,
  userId: worker.id,
  timestamp: new Date().toISOString(),
});
```

## Validation Errors

### Zod Validation

```typescript
import { z } from "zod";

const formSchema = z.object({
  email: z.string().email("Invalid email address"),
  age: z.number().min(18, "Must be 18 or older"),
});

try {
  const validated = formSchema.parse(formData);
  // Use validated data
} catch (error) {
  if (error instanceof z.ZodError) {
    // Handle validation errors
    error.errors.forEach((err) => {
      showFieldError(err.path.join("."), err.message);
    });
  }
}
```

### API Validation Errors

```typescript
interface ApiValidationError {
  field: string;
  message: string;
}

function handleApiValidationError(error: AxiosError) {
  const validationErrors = error.response?.data?.errors as ApiValidationError[];

  if (validationErrors) {
    validationErrors.forEach(({ field, message }) => {
      setFieldError(field, message);
    });
  }
}
```

## Network Errors

### Offline Detection

```typescript
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}
```

### Offline UI

```typescript
export function AppContainer() {
  const isOnline = useNetworkStatus();

  return (
    <>
      {!isOnline && (
        <Banner severity="warning">You are offline. Some features may not be available.</Banner>
      )}
      <App />
    </>
  );
}
```

## Timeout Handling

### Request Timeouts

```typescript
import axios from "axios";

const api = axios.create({
  timeout: 30000, // 30 seconds
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.code === "ECONNABORTED") {
      showErrorToast("Request timed out. Please try again.");
    }
    return Promise.reject(error);
  }
);
```

## Error Boundaries

### React Error Boundary

```typescript
import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logEvent("ERROR_BOUNDARY_TRIGGERED", {
      error: error.message,
      componentStack: errorInfo.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || <ErrorFallback />;
    }

    return this.props.children;
  }
}
```

## Best Practices

### 1. Always Handle Errors

```typescript
// ❌ Don't ignore errors
const { data } = useGetData();

// ✅ Handle error states
const { data, isError, error } = useGetData();
if (isError) {
  return <ErrorState error={error} />;
}
```

### 2. Provide User-Friendly Messages

```typescript
// ❌ Show technical errors to users
<Alert>{error.message}</Alert>

// ✅ Show helpful messages
<Alert>
  We couldn't load your shifts. Please check your connection and try again.
</Alert>
```

### 3. Log Errors for Debugging

```typescript
// Always log errors for monitoring
onError: (error) => {
  logEvent(APP_V2_APP_EVENTS.ERROR, {
    context: "shift-booking",
    error: error.message,
  });
  showErrorToast("Booking failed");
};
```

### 4. Provide Recovery Actions

```typescript
// ✅ Give users a way to recover
<ErrorState message="Failed to load data" onRetry={refetch} onDismiss={() => navigate("/home")} />
```

### 5. Different Strategies for Different Errors

```typescript
// Critical errors: Show error boundary
useErrorBoundary: (error) => isCriticalError(error);

// Expected errors: Show inline message
if (isError && error.response?.status === 404) {
  return <NotFoundMessage />;
}

// Transient errors: Auto-retry with backoff
retry: (failureCount) => failureCount < 3;
```



<!-- Source: .ruler/frontend/file-organization.md -->

# File Organization Standards

## Feature-Based Structure

```
FeatureName/
├── api/                          # Data fetching hooks
│   ├── useGetFeature.ts
│   ├── useUpdateFeature.ts
│   └── useDeleteFeature.ts
├── components/                   # Feature-specific components
│   ├── FeatureCard.tsx
│   ├── FeatureList.tsx
│   └── FeatureHeader.tsx
├── hooks/                        # Feature-specific hooks (non-API)
│   ├── useFeatureLogic.ts
│   └── useFeatureState.ts
├── utils/                        # Feature utilities
│   ├── formatFeature.ts
│   ├── formatFeature.test.ts
│   └── validateFeature.ts
├── __tests__/                    # Integration tests (optional)
│   └── FeatureFlow.test.tsx
├── Page.tsx                      # Main page component
├── Router.tsx                    # Feature routes
├── paths.ts                      # Route paths
├── types.ts                      # Shared types
├── constants.ts                  # Constants
└── README.md                     # Feature documentation (optional)
```

## File Naming Conventions

### React Components

- **PascalCase** for all React components
- Examples: `Button.tsx`, `UserProfile.tsx`, `ShiftCard.tsx`

### Avoid Path Stuttering

Don't repeat directory names in file names - the full path provides enough context:

❌ **Bad** - Path stuttering:

```
Shift/
  ShiftInvites/
    ShiftInviteCard.tsx      // ❌ "Shift" repeated 3 times in path
    ShiftInviteList.tsx      // ❌ Import: Shift/ShiftInvites/ShiftInviteCard
```

✅ **Good** - Clean, concise:

```
Shift/
  Invites/
    Card.tsx                 // ✅ Path: Shift/Invites/Card
    List.tsx                 // ✅ Import: Shift/Invites/List
```

**Reasoning:**

- The full path already provides context (`Shift/Invites/Card` is clear)
- Repeating names makes imports verbose: `import { ShiftInviteCard } from 'Shift/ShiftInvites/ShiftInviteCard'`
- Shorter names are easier to work with in the editor

### Utilities and Hooks

- **camelCase** for utilities, hooks, and non-component files
- Examples: `formatDate.ts`, `useAuth.ts`, `calculateTotal.ts`

### Multi-word Non-Components

- **kebab-case** for multi-word configuration or utility files
- Examples: `user-profile-utils.ts`, `api-helpers.ts`

### Test Files

- Co-locate with source: `Button.test.tsx` next to `Button.tsx`
- Test folder: `__tests__/` for integration tests
- Pattern: `*.test.ts` or `*.test.tsx`

### Constants and Types

- `types.ts` - Shared types for the feature
- `constants.ts` - Feature constants
- `paths.ts` - Route path constants

## Import Organization

### Import Order

```typescript
// 1. External dependencies (React, third-party)
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { parseISO, format } from "date-fns";

// 2. Internal packages (@clipboard-health, @src)
import { Button } from "@clipboard-health/ui-components";
import { CbhIcon } from "@clipboard-health/ui-components";
import { formatDate } from "@src/appV2/lib/dates";
import { useDefinedWorker } from "@src/appV2/Worker/useDefinedWorker";

// 3. Relative imports (same feature)
import { useFeatureData } from "./hooks/useFeatureData";
import { FeatureCard } from "./components/FeatureCard";
import { FEATURE_PATHS } from "./paths";
import { type FeatureData } from "./types";
```

### Import Grouping Rules

- Add blank lines between groups
- Sort alphabetically within each group (optional but recommended)
- Group type imports with their module: `import { type User } from './types'`

## Path Management

### Defining Paths

```typescript
// paths.ts
import { RootPaths } from "@src/appV2/App/paths";

export const FEATURE_BASE_PATH = "feature";
export const FEATURE_FULL_PATH = `${RootPaths.APP_V2_HOME}/${FEATURE_BASE_PATH}`;

export const FEATURE_PATHS = {
  ROOT: FEATURE_FULL_PATH,
  DETAILS: `${FEATURE_FULL_PATH}/:id`,
  EDIT: `${FEATURE_FULL_PATH}/:id/edit`,
  CREATE: `${FEATURE_FULL_PATH}/create`,
} as const;
```

### Using Paths

```typescript
import { useHistory } from "react-router-dom";
import { FEATURE_PATHS } from "./paths";

// Navigation
history.push(FEATURE_PATHS.DETAILS.replace(":id", featureId));

// Route definition
<Route path={FEATURE_PATHS.DETAILS} component={FeatureDetailsPage} />;
```

## Types and Interfaces

### Separate vs Co-located Types

```typescript
// Option 1: Separate types.ts for shared types
// types.ts
export interface Feature {
  id: string;
  name: string;
}

export type FeatureStatus = "active" | "inactive";

// Option 2: Co-located with component for component-specific types
// FeatureCard.tsx
interface FeatureCardProps {
  feature: Feature;
  onSelect: (id: string) => void;
}

export function FeatureCard(props: FeatureCardProps) {
  // ...
}
```

## Constants

### Defining Constants

```typescript
// constants.ts
export const FEATURE_STATUS = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  PENDING: "pending",
} as const;

export type FeatureStatus = (typeof FEATURE_STATUS)[keyof typeof FEATURE_STATUS];

export const MAX_ITEMS = 100;
export const DEFAULT_PAGE_SIZE = 20;

export const FEATURE_EVENTS = {
  VIEWED: "FEATURE_VIEWED",
  CREATED: "FEATURE_CREATED",
  UPDATED: "FEATURE_UPDATED",
} as const;
```

## Folder Depth Guidelines

- **Maximum 3 levels deep** for feature folders
- For deeper nesting, consider splitting into separate features
- Use meaningful folder names that describe the content

```
Good:
├── Shift/
│   ├── Calendar/
│   │   └── ShiftCalendarCore.tsx
│   └── Card/
│       └── ShiftCard.tsx

Avoid:
├── Shift/
│   ├── Components/
│   │   ├── Display/
│   │   │   ├── Calendar/
│   │   │   │   └── Core/
│   │   │   │       └── ShiftCalendarCore.tsx  # Too deep!
```

## Module Exports

### Index Files

Avoid using `index.ts` files in the redesign folder. Prefer explicit imports.

```typescript
// Avoid
// index.ts
export * from "./Button";
export * from "./Card";

// Prefer explicit imports
import { Button } from "@redesign/components/Button";
import { Card } from "@redesign/components/Card";
```

### Named Exports

Always use named exports (not default exports) in redesign code.

```typescript
// Good
export function Button(props: ButtonProps) {}

// Avoid
export default function Button(props: ButtonProps) {}
```

## API Folder Structure

```
api/
├── useGetFeatures.ts          # GET requests
├── useCreateFeature.ts        # POST requests
├── useUpdateFeature.ts        # PUT/PATCH requests
├── useDeleteFeature.ts        # DELETE requests
└── schemas.ts                 # Zod schemas (optional)
```

## Utils Folder Guidelines

- Keep utilities pure functions when possible
- Co-locate tests with utilities
- Export individual functions (not as objects)

```typescript
// Good
// utils/formatFeatureName.ts
export function formatFeatureName(name: string): string {
  return name.trim().toUpperCase();
}

// utils/formatFeatureName.test.ts
import { formatFeatureName } from "./formatFeatureName";

describe("formatFeatureName", () => {
  it("should format name correctly", () => {
    expect(formatFeatureName("  test  ")).toBe("TEST");
  });
});
```



<!-- Source: .ruler/frontend/imports.md -->

# Import Standards

## Enforced Restrictions

The `@redesign/` folder has strict import rules enforced by ESLint via `.eslintrcRestrictedImports.js`.

## Restricted MUI Imports

### ❌ Component Restrictions

Do NOT import these components directly from `@mui/material`:

```typescript
// ❌ Forbidden
import {
  Avatar,
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Badge,
  Button,
  Card,
  Chip,
  Dialog,
  DialogTitle,
  Divider,
  Drawer,
  FilledInput,
  Icon,
  IconButton,
  InputBase,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Modal,
  OutlinedInput,
  Rating,
  Slider,
  TextField,
  Typography,
  Tab,
  Tabs,
  SvgIcon,
} from "@mui/material";
```

### ✅ Use Internal Wrappers

```typescript
// ✅ Correct
import { Button } from "@redesign/components/Button";
import { IconButton } from "@redesign/components/IconButton";
import { LoadingButton } from "@redesign/components/LoadingButton";
```

### Error Message

```
1. Many of the MUI components have our own wrappers in the "components" directory.
   Use them instead of the MUI components.
2. Instead of deprecated `styled`, use `sx` prop to define custom styles that have
   access to themes. See guidelines: https://mui.com/system/getting-started/the-sx-prop/.
3. Don't use Modal, use BottomSheet or FullScreenDialog. Don't use DialogTitle as
   we don't have a single appearance for all dialogs.
```

## Icon Restrictions

### ❌ MUI Icons Forbidden

```typescript
// ❌ Don't use MUI icons
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
```

### ✅ Use CbhIcon

```typescript
// ✅ Correct
import { CbhIcon } from '@clipboard-health/ui-components';

<CbhIcon type="search" size="large" />
<CbhIcon type="close" size="medium" />
<CbhIcon type="plus" size="small" />
```

### Error Message

```
Do not use mui icons. We have our own icons set,
`import { CbhIcon } from "@clipboard-health/ui-components";`
```

## Allowed MUI Imports

### ✅ Safe to Import from MUI

These components can be imported directly:

```typescript
import {
  Box,
  Stack,
  Container,
  Grid,
  Paper,
  Skeleton,
  CircularProgress,
  LinearProgress,
  BottomNavigation,
  BottomNavigationAction,
  ThemeProvider,
  useTheme,
  useMediaQuery,
} from "@mui/material";
```

Layout and utility components are generally safe.

## Path Aliases

### Use @ Prefix for Absolute Imports

```typescript
// ✅ Use path aliases
import { formatDate } from "@src/appV2/lib/dates";
import { useDefinedWorker } from "@src/appV2/Worker/useDefinedWorker";
import { Button } from "@clipboard-health/ui-components";
import { getTheme } from "@clipboard-health/ui-theme";

// ❌ Avoid relative paths to distant folders
import { formatDate } from "../../../lib/dates";
```

### Relative Imports for Same Feature

```typescript
// ✅ Relative imports within the same feature
import { FeatureCard } from "./components/FeatureCard";
import { useFeatureData } from "./hooks/useFeatureData";
import { FEATURE_PATHS } from "./paths";
import { type FeatureData } from "./types";
```

## Import Grouping

### Standard Order

```typescript
// 1. External dependencies (React, third-party libraries)
import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { parseISO, format } from "date-fns";
import { z } from "zod";

// 2. Internal packages (@clipboard-health, @src)
import { Button, CbhIcon } from "@clipboard-health/ui-components";
import { getTheme } from "@clipboard-health/ui-theme";
import { formatDate } from "@src/appV2/lib/dates";
import { useDefinedWorker } from "@src/appV2/Worker/useDefinedWorker";
import { RootPaths } from "@src/appV2/App/paths";

// 3. Relative imports (same feature)
import { useFeatureData } from "./hooks/useFeatureData";
import { FeatureCard } from "./components/FeatureCard";
import { FEATURE_PATHS } from "./paths";
import { type FeatureData, type FeatureOptions } from "./types";
```

### Blank Lines Between Groups

- Add blank line between each group
- Helps with readability and organization
- ESLint/Prettier can auto-format this

## Type Imports

### Inline Type Imports

```typescript
// ✅ Preferred: Inline type imports
import { type User, type UserOptions } from "./types";
import { formatUser } from "./utils";
```

### Separate Type Imports

```typescript
// ✅ Also acceptable
import type { User, UserOptions } from "./types";
import { formatUser } from "./utils";
```

## Barrel Exports (index.ts)

### ❌ Avoid in Redesign

```typescript
// ❌ Don't create index.ts files
// index.ts
export * from "./Button";
export * from "./Card";
```

### ✅ Use Explicit Imports

```typescript
// ✅ Import directly from files
import { Button } from "@redesign/components/Button";
import { Card } from "@redesign/components/Card";
```

## Dynamic Imports

### Code Splitting

```typescript
// For large components or routes
const HeavyComponent = lazy(() => import("./HeavyComponent"));

// In component
<Suspense fallback={<Loading />}>
  <HeavyComponent />
</Suspense>;
```

## Common Import Patterns

### API Hooks

```typescript
import { useGetQuery } from "@src/appV2/lib/api";
import { get, post } from "@src/appV2/lib/api";
```

### React Query

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type UseQueryOptions, type UseQueryResult } from "@tanstack/react-query";
```

### Routing

```typescript
import { useHistory, useLocation, useParams } from "react-router-dom";
import { type LocationState } from "history";
```

### Date Utilities

```typescript
import { parseISO, format, addDays, isBefore } from "date-fns";
```

### Validation

```typescript
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
```

## ESLint Configuration

The restrictions are enforced in `.eslintrcRestrictedImports.js`:

```javascript
module.exports = {
  paths: [
    {
      name: "@mui/material",
      importNames: [...restrictedComponents],
      message: "Use our wrapper components from @redesign/components",
    },
  ],
  patterns: [
    {
      group: ["@mui/icons-material/*"],
      message: "Use CbhIcon from @clipboard-health/ui-components",
    },
  ],
};
```

## Checking for Violations

```bash
# Lint the redesign folder
npm run lint:v2

# Auto-fix import issues
npm run lint:v2:fix
```

## Migration Guide

### When You See Import Errors

1. **MUI Component Error**

   - Check if wrapper exists in `@redesign/components/`
   - If yes, import from there
   - If no, discuss with team about creating wrapper

2. **MUI Icon Error**

   - Find equivalent in CbhIcon types
   - Use `<CbhIcon type="icon-name" />`
   - Check icon names in `@clipboard-health/ui-components`

3. **Deprecated styled() Error**
   - Replace with `sx` prop
   - Move styles inline or to component

## Summary

✅ **DO**:

- Use wrappers from `@redesign/components/`
- Use `CbhIcon` for all icons
- Use `@src` path alias for absolute imports
- Group imports by external, internal, relative
- Use explicit imports (not barrel exports)

❌ **DON'T**:

- Import MUI components directly (use wrappers)
- Import MUI icons (use CbhIcon)
- Use `styled()` or `makeStyles()`
- Use `Modal` (use BottomSheet/FullScreenDialog)
- Create `index.ts` barrel exports in redesign



<!-- Source: .ruler/frontend/performance.md -->

# Performance Standards

## React Query Optimization

### Stale Time Configuration

```typescript
// Set appropriate staleTime to avoid unnecessary refetches
useGetQuery({
  url: "/api/resource",
  responseSchema: schema,
  staleTime: minutesToMilliseconds(5), // Don't refetch for 5 minutes
  cacheTime: minutesToMilliseconds(30), // Keep in cache for 30 minutes
});
```

### Conditional Fetching

```typescript
// Only fetch when conditions are met
const { data } = useGetQuery({
  url: `/api/users/${userId}`,
  responseSchema: userSchema,
  enabled: isDefined(userId) && isFeatureEnabled, // Don't fetch until ready
});
```

### Query Cancellation

```typescript
export function usePaginatedData(params: Params) {
  const queryClient = useQueryClient();

  return useInfiniteQuery({
    queryKey: ["data", params],
    queryFn: async ({ pageParam }) => {
      // Cancel previous in-flight requests
      await queryClient.cancelQueries({ queryKey: ["data"] });

      const response = await get({
        url: "/api/data",
        queryParams: { cursor: pageParam, ...params },
      });
      return response.data;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}
```

### Prefetching

```typescript
export function usePreloadNextPage(nextUserId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (nextUserId) {
      // Prefetch next page in background
      queryClient.prefetchQuery({
        queryKey: ["user", nextUserId],
        queryFn: () => fetchUser(nextUserId),
        staleTime: minutesToMilliseconds(5),
      });
    }
  }, [nextUserId, queryClient]);
}
```

## React Optimization

### useMemo for Expensive Computations

```typescript
export function DataList({ items }: { items: Item[] }) {
  // Memoize expensive sorting/filtering
  const sortedItems = useMemo(() => {
    return items.filter((item) => item.isActive).sort((a, b) => a.priority - b.priority);
  }, [items]);

  return <List items={sortedItems} />;
}
```

### useCallback for Event Handlers

```typescript
export function ParentComponent() {
  const [selected, setSelected] = useState<string>();

  // Memoize callback to prevent child re-renders
  const handleSelect = useCallback((id: string) => {
    setSelected(id);
    logEvent("ITEM_SELECTED", { id });
  }, []); // Stable reference

  return <ChildComponent onSelect={handleSelect} />;
}
```

### React.memo for Pure Components

```typescript
import { memo } from "react";

interface ItemCardProps {
  item: Item;
  onSelect: (id: string) => void;
}

// Memoize component to prevent unnecessary re-renders
export const ItemCard = memo(function ItemCard({ item, onSelect }: ItemCardProps) {
  return (
    <Card onClick={() => onSelect(item.id)}>
      <h3>{item.name}</h3>
    </Card>
  );
});
```

### Avoid Inline Object/Array Creation

```typescript
// ❌ Creates new object on every render
<Component style={{ padding: 8 }} />
<Component items={[1, 2, 3]} />

// ✅ Define outside or use useMemo
const style = { padding: 8 };
const items = [1, 2, 3];
<Component style={style} items={items} />

// ✅ Or use useMemo for dynamic values
const style = useMemo(() => ({ padding: spacing }), [spacing]);
```

## List Rendering

### Key Prop for Lists

```typescript
// ✅ Use stable, unique keys
items.map((item) => <ItemCard key={item.id} item={item} />);

// ❌ Don't use index as key (unless list never changes)
items.map((item, index) => <ItemCard key={index} item={item} />);
```

### Virtualization for Long Lists

```typescript
import { FixedSizeList } from "react-window";

export function VirtualizedList({ items }: { items: Item[] }) {
  return (
    <FixedSizeList height={600} itemCount={items.length} itemSize={80} width="100%">
      {({ index, style }) => (
        <div style={style}>
          <ItemCard item={items[index]} />
        </div>
      )}
    </FixedSizeList>
  );
}
```

### Pagination Instead of Infinite Data

```typescript
// For large datasets, use pagination
export function PaginatedList() {
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading } = useGetPaginatedData({
    page,
    pageSize,
  });

  return (
    <>
      <List items={data?.items} />
      <Pagination page={page} total={data?.total} pageSize={pageSize} onChange={setPage} />
    </>
  );
}
```

## Data Fetching Patterns

### Parallel Queries

```typescript
export function useParallelData() {
  // Fetch in parallel
  const users = useGetUsers();
  const shifts = useGetShifts();
  const workplaces = useGetWorkplaces();

  // All queries run simultaneously
  const isLoading = users.isLoading || shifts.isLoading || workplaces.isLoading;

  return {
    users: users.data,
    shifts: shifts.data,
    workplaces: workplaces.data,
    isLoading,
  };
}
```

### Dependent Queries

```typescript
export function useDependentData(userId?: string) {
  // First query
  const { data: user } = useGetUser(userId, {
    enabled: isDefined(userId),
  });

  // Second query depends on first
  const { data: shifts } = useGetUserShifts(user?.id, {
    enabled: isDefined(user?.id), // Only fetch when user is loaded
  });

  return { user, shifts };
}
```

### Debouncing Search Queries

```typescript
import { useDebouncedValue } from "@src/appV2/lib/hooks";

export function SearchComponent() {
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebouncedValue(searchTerm, 300);

  const { data } = useSearchQuery(debouncedSearch, {
    enabled: debouncedSearch.length > 2,
  });

  return (
    <>
      <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
      <Results data={data} />
    </>
  );
}
```

## Code Splitting

### Route-Based Splitting

```typescript
import { lazy, Suspense } from "react";

// Lazy load route components
const ShiftDetailsPage = lazy(() => import("./Shift/DetailsPage"));
const ProfilePage = lazy(() => import("./Profile/Page"));

export function Router() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/shifts/:id" element={<ShiftDetailsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Routes>
    </Suspense>
  );
}
```

### Component-Based Splitting

```typescript
// Split large components that aren't immediately needed
const HeavyChart = lazy(() => import("./HeavyChart"));

export function Dashboard() {
  const [showChart, setShowChart] = useState(false);

  return (
    <div>
      <Summary />
      {showChart && (
        <Suspense fallback={<ChartSkeleton />}>
          <HeavyChart />
        </Suspense>
      )}
    </div>
  );
}
```

## Image Optimization

### Lazy Loading Images

```typescript
<img
  src={imageUrl}
  alt={alt}
  loading="lazy" // Native lazy loading
/>
```

### Responsive Images

```typescript
<img
  srcSet={`
    ${image_small} 480w,
    ${image_medium} 800w,
    ${image_large} 1200w
  `}
  sizes="(max-width: 480px) 480px, (max-width: 800px) 800px, 1200px"
  src={image_medium}
  alt={alt}
/>
```

## State Management

### Avoid Prop Drilling

```typescript
// ❌ Prop drilling
<Parent>
  <Child data={data}>
    <GrandChild data={data}>
      <GreatGrandChild data={data} />
    </GrandChild>
  </Child>
</Parent>;

// ✅ Use context for deeply nested data
const DataContext = createContext<Data | undefined>(undefined);

<DataContext.Provider value={data}>
  <Parent>
    <Child>
      <GrandChild>
        <GreatGrandChild />
      </GrandChild>
    </Child>
  </Parent>
</DataContext.Provider>;
```

### Local State Over Global State

```typescript
// ✅ Keep state as local as possible
export function FormComponent() {
  const [formData, setFormData] = useState({}); // Local state
  // Only lift state up when needed by multiple components
}
```

## Bundle Size Optimization

### Tree Shaking

```typescript
// ✅ Import only what you need
import { format } from "date-fns";

// ❌ Imports entire library
import * as dateFns from "date-fns";
```

### Avoid Large Dependencies

```typescript
// Check bundle size before adding dependencies
// Use lighter alternatives when possible

// ❌ Heavy library for simple task
import moment from "moment";

// ✅ Lighter alternative
import { format } from "date-fns";
```

## Monitoring Performance

### React DevTools Profiler

```typescript
// Wrap components to profile
<Profiler id="ShiftList" onRender={onRenderCallback}>
  <ShiftList />
</Profiler>
```

### Web Vitals

```typescript
import { getCLS, getFID, getFCP, getLCP, getTTFB } from "web-vitals";

// Track Core Web Vitals
getCLS(console.log);
getFID(console.log);
getFCP(console.log);
getLCP(console.log);
getTTFB(console.log);
```

## Best Practices Summary

### ✅ DO

- Set appropriate `staleTime` and `cacheTime` for queries
- Use `useMemo` for expensive computations
- Use `useCallback` for callbacks passed to children
- Use React.memo for pure components
- Virtualize long lists
- Lazy load routes and heavy components
- Use pagination for large datasets
- Debounce search inputs
- Cancel queries when component unmounts
- Prefetch data when predictable

### ❌ DON'T

- Fetch data unnecessarily
- Create objects/arrays inline in props
- Use index as key for dynamic lists
- Render all items in very long lists
- Import entire libraries when only need parts
- Keep all state global
- Ignore performance warnings in console
- Skip memoization for expensive operations



<!-- Source: .ruler/frontend/react-patterns.md -->

# React Component Patterns

## Core Principles

- **Storybook is the single source of truth** for UI components, not Figma
- **Named exports only** (no default exports in redesign)
- **Explicit types** for all props and return values
- **Handle all states**: loading, error, empty, success
- **Composition over configuration** - prefer children over complex props

## Component Structure

Follow this consistent structure for all components:

```typescript
// 1. Imports (grouped with blank lines between groups)
import { useState, useMemo, useCallback } from "react";
import { Box, Typography } from "@redesign/components";

import { useGetData } from "@src/appV2/api/useGetData";
import { formatDate } from "@src/appV2/utils/date";

import { ChildComponent } from "./ChildComponent";

// 2. Types (interfaces for props, types for unions)
interface UserCardProps {
  userId: string;
  onAction: (action: string) => void;
  isHighlighted?: boolean;
}

// 3. Component definition
export function UserCard({ userId, onAction, isHighlighted = false }: UserCardProps) {
  // A. React Query hooks first
  const { data: user, isLoading, isError } = useGetUser(userId);

  // B. Local state
  const [isExpanded, setIsExpanded] = useState(false);

  // C. Derived values (with useMemo for expensive computations)
  const displayName = useMemo(
    () => (user ? `${user.firstName} ${user.lastName}` : "Unknown"),
    [user]
  );

  // D. Event handlers (with useCallback when passed to children)
  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => !prev);
    onAction("toggle");
  }, [onAction]);

  // E. Early returns for loading/error states
  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState message="Failed to load user" />;
  if (!user) return <EmptyState message="User not found" />;

  // F. Render
  return (
    <Box sx={{ padding: 2, backgroundColor: isHighlighted ? "primary.light" : "background.paper" }}>
      <Typography variant="h6">{displayName}</Typography>
      <ChildComponent onClick={handleToggle} />
    </Box>
  );
}
```

## Why This Structure?

1. **Imports grouped** - Easy to see dependencies
2. **Types first** - Documents component API
3. **Hooks at top** - React rules of hooks
4. **Derived values next** - Shows data flow
5. **Handlers together** - Easy to find event logic
6. **Early returns** - Fail fast, reduce nesting
7. **Render last** - Main component logic

## Component Naming

- **PascalCase** for components: `UserProfile`, `ShiftCard`
- **camelCase** for hooks and utilities: `useUserData`, `formatDate`
- Export function components (not default exports in redesign)

## Props

- Always define explicit prop types
- Use destructuring with types
- Avoid prop spreading unless wrapping a component

```typescript
// Good
interface ButtonProps {
  onClick: () => void;
  label: string;
  disabled?: boolean;
}

export function Button({ onClick, label, disabled = false }: ButtonProps) {
  return (
    <button onClick={onClick} disabled={disabled}>
      {label}
    </button>
  );
}

// Acceptable for wrappers
export function CustomButton(props: ButtonProps) {
  return <ButtonBase {...props} LinkComponent={InternalLink} />;
}
```

## Wrappers

- Wrap third-party components to add app-specific functionality
- Example: `Button.tsx` wraps `@clipboard-health/ui-components` Button

```typescript
import {
  Button as ButtonBase,
  type ButtonProps as ButtonPropsBase,
} from "@clipboard-health/ui-components";
import { type LocationState } from "history";

import { ButtonInternalLink } from "./ButtonInternalLink";

interface ButtonProps extends Omit<ButtonPropsBase, "LinkComponent"> {
  locationState?: LocationState;
}

export function Button(props: ButtonProps) {
  return <ButtonBase {...props} LinkComponent={ButtonInternalLink} />;
}
```

## State Management

- Use `useState` for local component state
- Use `useMemo` for expensive computations
- Use `useCallback` for functions passed to children
- Lift state up when needed by multiple components

## Conditional Rendering

```typescript
// Early returns for loading/error states
if (isLoading) return <LoadingState />;
if (isError) return <ErrorState />;

// Ternary for simple conditions
return isActive ? <ActiveView /> : <InactiveView />;

// && for conditional rendering
return <div>{hasData && <DataDisplay data={data} />}</div>;
```

## Component Composition

Prefer composition over complex props. Build small, focused components that compose together.

```typescript
// ✅ Good - Composition pattern
interface CardProps {
  children: ReactNode;
}

export function Card({ children }: CardProps) {
  return <Box sx={{ padding: 3, borderRadius: 2, boxShadow: 1 }}>{children}</Box>;
}

export function CardHeader({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ marginBottom: 2 }}>
      <Typography variant="h6">{children}</Typography>
    </Box>
  );
}

export function CardContent({ children }: { children: ReactNode }) {
  return <Box>{children}</Box>;
}

// Usage - Flexible and composable
<Card>
  <CardHeader>User Profile</CardHeader>
  <CardContent>
    <UserDetails user={user} />
    <UserActions onEdit={handleEdit} />
  </CardContent>
</Card>;

// ❌ Bad - Complex props that limit flexibility
interface ComplexCardProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  content: ReactNode;
  variant?: "default" | "highlighted" | "error";
  showBorder?: boolean;
  elevation?: number;
}

export function ComplexCard(props: ComplexCardProps) {
  // Too many props, hard to extend
  // ...
}
```

## Children Patterns

### Render Props Pattern

Use when child components need access to parent state:

```typescript
interface DataProviderProps {
  children: (data: Data, isLoading: boolean) => ReactNode;
}

export function DataProvider({ children }: DataProviderProps) {
  const { data, isLoading } = useGetData();

  return <>{children(data, isLoading)}</>;
}

// Usage
<DataProvider>
  {(data, isLoading) => (isLoading ? <Loading /> : <DataDisplay data={data} />)}
</DataProvider>;
```

### Compound Components Pattern

For components that work together:

```typescript
interface TabsContextValue {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const TabsContext = createContext<TabsContextValue | undefined>(undefined);

export function Tabs({ children, defaultTab }: { children: ReactNode; defaultTab: string }) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <Box>{children}</Box>
    </TabsContext.Provider>
  );
}

export function TabList({ children }: { children: ReactNode }) {
  return <Box sx={{ display: "flex", gap: 1 }}>{children}</Box>;
}

export function Tab({ value, children }: { value: string; children: ReactNode }) {
  const context = useContext(TabsContext);
  if (!context) throw new Error("Tab must be used within Tabs");

  const { activeTab, setActiveTab } = context;
  const isActive = activeTab === value;

  return (
    <Button onClick={() => setActiveTab(value)} variant={isActive ? "contained" : "text"}>
      {children}
    </Button>
  );
}

export function TabPanel({ value, children }: { value: string; children: ReactNode }) {
  const context = useContext(TabsContext);
  if (!context) throw new Error("TabPanel must be used within Tabs");

  if (context.activeTab !== value) return null;
  return <Box sx={{ padding: 2 }}>{children}</Box>;
}

// Usage - Intuitive API
<Tabs defaultTab="profile">
  <TabList>
    <Tab value="profile">Profile</Tab>
    <Tab value="settings">Settings</Tab>
  </TabList>
  <TabPanel value="profile">
    <ProfileContent />
  </TabPanel>
  <TabPanel value="settings">
    <SettingsContent />
  </TabPanel>
</Tabs>;
```

## Error Boundaries

Use error boundaries for graceful error handling:

```typescript
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Error caught by boundary:", error, errorInfo);
    // Log to error tracking service
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || <ErrorFallback error={this.state.error} />;
    }

    return this.props.children;
  }
}

// Usage
<ErrorBoundary fallback={<ErrorPage />}>
  <App />
</ErrorBoundary>;
```

## Handling Lists

### Key Props

Always use stable, unique keys (never index):

```typescript
// ✅ Good - Unique, stable ID
{
  users.map((user) => <UserCard key={user.id} user={user} />);
}

// ❌ Bad - Index as key (causes bugs when list changes)
{
  users.map((user, index) => <UserCard key={index} user={user} />);
}

// ✅ Acceptable - Composite key when no ID available
{
  items.map((item) => <ItemCard key={`${item.type}-${item.name}`} item={item} />);
}
```

### Empty States

Always handle empty lists:

```typescript
export function UserList({ users }: { users: User[] }) {
  if (users.length === 0) {
    return (
      <EmptyState
        icon={<PersonIcon />}
        title="No users found"
        description="Try adjusting your search criteria"
      />
    );
  }

  return (
    <Box>
      {users.map((user) => (
        <UserCard key={user.id} user={user} />
      ))}
    </Box>
  );
}
```

## Conditional Rendering Best Practices

```typescript
export function ShiftCard({ shift }: { shift: Shift }) {
  // ✅ Good - Early returns for invalid states
  if (!shift) return null;
  if (shift.isDeleted) return null;

  // ✅ Good - Ternary for simple either/or
  const statusColor = shift.isUrgent ? "error" : "default";

  return (
    <Box>
      <Typography color={statusColor}>{shift.title}</Typography>

      {/* ✅ Good - && for optional elements */}
      {shift.isPremium && <PremiumBadge />}

      {/* ✅ Good - Ternary for alternate content */}
      {shift.isBooked ? <BookedStatus worker={shift.worker} /> : <AvailableStatus />}

      {/* ❌ Bad - Nested ternaries (hard to read) */}
      {shift.status === "urgent" ? (
        <UrgentBadge />
      ) : shift.status === "normal" ? (
        <NormalBadge />
      ) : (
        <DefaultBadge />
      )}

      {/* ✅ Good - Extract to variable or switch */}
      <StatusBadge status={shift.status} />
    </Box>
  );
}
```

## Performance Optimization

See `.agents/rules/performance.md` for detailed optimization patterns.

### When to Use `useMemo`

```typescript
// ✅ Do - Expensive computation
const sortedUsers = useMemo(() => users.sort((a, b) => a.name.localeCompare(b.name)), [users]);

// ❌ Don't - Simple operations (premature optimization)
const fullName = useMemo(() => `${firstName} ${lastName}`, [firstName, lastName]);
```

### When to Use `useCallback`

```typescript
// ✅ Do - Function passed to memoized child
const MemoizedChild = React.memo(ChildComponent);

function Parent() {
  const handleClick = useCallback(() => {
    console.log("clicked");
  }, []);

  return <MemoizedChild onClick={handleClick} />;
}

// ❌ Don't - Function not passed to children
const handleSubmit = useCallback(() => {
  // No child components use this
}, []);
```

## Related Rules

- **Data Fetching**: See `.agents/rules/data-fetching.md` for React Query patterns
- **Custom Hooks**: See `.agents/rules/custom-hooks.md` for hook creation patterns
- **Testing**: See `.agents/rules/testing.md` for component testing strategies
- **Styling**: See `.agents/rules/styling.md` for MUI and sx prop usage



<!-- Source: .ruler/frontend/react.md -->

# React

- Destructure props in function body rather than in function signature
- Prefer inline JSX rather than extracting variables and functions as variables outside of JSX
- Use useModalState for any showing/hiding functionality like dialogs
- Utilize custom hooks to encapsulate and reuse stateful logic
- When performing data-fetching in a custom hook, always use Zod to define any request and response schemas
- Use react-hook-form for all form UIs and use zod resolver for form schema validation
- Use date-fns for any Date based operations like formatting



<!-- Source: .ruler/frontend/styling.md -->

# Styling Standards

## Technology Stack

- **Material UI (MUI)** via `@clipboard-health/ui-theme`
- **sx prop** for custom styles (NOT `styled()`)
- Custom component wrappers in `redesign/components/`
- **Storybook** as single source of truth for UI components

## Core Principles

1. **Always use `sx` prop** - Never CSS/SCSS/SASS files
2. **Use theme tokens** - Never hardcode colors, spacing, or sizes
3. **Leverage meaningful tokens** - Use semantic names like `theme.palette.text.primary`, not `common.white`
4. **Type-safe theme access** - Use `sx={(theme) => ({...})}`, not string paths like `"text.secondary"`
5. **Follow spacing system** - Use indices 1-12 (4px-64px)
6. **Storybook is source of truth** - Check Storybook before Figma

## Restricted Patterns

### ❌ DO NOT USE

- `styled()` from MUI (deprecated in our codebase)
- `makeStyles()` from MUI (deprecated)
- CSS/SCSS/SASS files
- Direct MUI icons from `@mui/icons-material`
- Direct MUI components without wrappers (see list below)
- Inline styles via `style` prop (use `sx` instead)
- String paths for theme tokens (not type-safe)

### Rationale

```javascript
// From .eslintrcRestrictedImports.js
message: `1. Many of the MUI components have our own wrappers in the "components" directory. Use them instead of the MUI components.
   2. Instead of deprecated \`styled\`, use \`sx\` prop to define custom styles that have access to themes. See guidelines: https://mui.com/system/getting-started/the-sx-prop/.
   3. Don't use Modal, use BottomSheet or FullScreenDialog. Don't use DialogTitle as we don't have a single appearance for all dialogs.`;
```

## Storybook as Source of Truth

**Important:** Storybook reflects what's actually implemented, not Figma designs.

### When Storybook Differs from Figma

1. **Check Storybook first** - It shows real, implemented components
2. **Use closest existing variant** - Don't create one-off font sizes/colors
3. **Confirm changes are intentional** - Ask PM or `@frontend` before updating components
4. **Create follow-up ticket** - If component needs updating but you're short on time
5. **Make changes system-wide** - Component updates should benefit entire app

### Process

- **Minor differences** (font sizes, colors) → Stick to Storybook
- **Component looks different** → Confirm with PM, update component intentionally
- **Missing component** → Ask `@frontend` - it may exist with a different name

## Use Internal Components

### ✅ ALWAYS USE Our Wrappers

Instead of importing directly from `@mui/material`, use our wrappers from `@redesign/components`:

```typescript
// ❌ Don't
import { Button, IconButton } from "@mui/material";

// ✅ Do
import { Button } from "@redesign/components/Button";
import { IconButton } from "@redesign/components/IconButton";
```

### Component Wrapper List

Use wrappers instead of direct MUI imports for:

- `Button`, `LoadingButton`, `IconButton`
- `Avatar`, `Accordion`, `Badge`
- `Card`, `Chip`, `Dialog`
- `Drawer`, `List`, `ListItem`
- `Rating`, `Slider`, `Switch`
- `TextField`, `Typography`, `Tab`, `Tabs`

Full restricted list in `.eslintrcRestrictedImports.js`

## Icons

### Use CbhIcon

```typescript
// ❌ Don't use MUI icons
import SearchIcon from '@mui/icons-material/Search';

// ✅ Use CbhIcon
import { CbhIcon } from '@clipboard-health/ui-components';

<CbhIcon type="search" size="large" />
<CbhIcon type="search-colored" size="medium" />
```

### Icon Variants

- Many icons have `-colored` variants for active states
- Example: `"search"` and `"search-colored"`

## Styling with sx Prop

### Basic Usage - Type-Safe Theme Access

❌ **Never** hardcode values or use string paths:

```typescript
<Box
  sx={{
    backgroundColor: "red", // ❌ Raw color
    color: "#ADFF11", // ❌ Hex code
    padding: "16px", // ❌ Raw size
    color: "text.secondary", // ❌ String path (no TypeScript support)
  }}
/>
```

✅ **Always** use theme with type safety:

```typescript
<Box
  sx={(theme) => ({
    backgroundColor: theme.palette.background.primary, // ✅ Semantic token
    color: theme.palette.text.secondary, // ✅ Type-safe
    padding: theme.spacing(4), // or just: padding: 4   // ✅ Spacing system
  })}
/>
```

### Use Meaningful Tokens

❌ **Avoid** non-descriptive tokens:

```typescript
theme.palette.common.white; // ❌ No context about usage
theme.palette.green300; // ❌ Which green? When to use?
```

✅ **Use** semantic tokens:

```typescript
theme.palette.background.tertiary; // ✅ Clear purpose
theme.palette.instantPay.background; // ✅ Intent is obvious
theme.palette.text.primary; // ✅ Meaningful
```

## Spacing System

We use a strict index-based spacing system:

| Index | 1   | 2   | 3   | 4    | 5    | 6    | 7    | 8    | 9    | 10   | 11   | 12   |
| ----- | --- | --- | --- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| Size  | 4px | 6px | 8px | 12px | 16px | 20px | 24px | 32px | 40px | 48px | 56px | 64px |

**Usage:**

```typescript
<Box sx={{ padding: 5 }} />    // → 16px
<Box sx={{ marginX: 4 }} />    // → 12px left and right
<Box sx={{ gap: 3 }} />        // → 8px
```

**Use `rem` for fonts and heights:**

```typescript
<Box
  sx={(theme) => ({
    height: "3rem", // ✅ Scales with user zoom
    fontSize: theme.typography.body1.fontSize, // ✅ From theme
    padding: 5, // ✅ px prevents overflow when zoomed
  })}
/>
```

**Reasoning:** Users who adjust device-wide zoom need `rem` for fonts/heights to scale properly, but `px` spacing prevents layout overflow.

## Theme Integration

### Responsive Styles

```typescript
<Box
  sx={{
    width: {
      xs: "100%", // Mobile
      sm: "75%", // Tablet
      md: "50%", // Desktop
    },
    padding: {
      xs: 1,
      md: 3,
    },
  }}
/>
```

### Pseudo-classes and Hover States

```typescript
<Box
  sx={{
    "&:hover": {
      backgroundColor: "primary.dark",
      cursor: "pointer",
    },
    "&:disabled": {
      opacity: 0.5,
    },
    "&.active": {
      borderColor: "primary.main",
    },
  }}
/>
```

### Nested Selectors

```typescript
<Box
  sx={{
    "& .child-element": {
      color: "text.secondary",
    },
    "& > div": {
      marginBottom: 1,
    },
    // Target nested MUI components
    "& .MuiTypography-root": {
      color: theme.palette.intent?.disabled.text,
    },
  }}
/>
```

## Shorthand Properties

MUI provides shorthand properties - use full names, not abbreviations:

✅ **Use full names:**

```typescript
<Box
  sx={{
    padding: 2, // ✅ Clear
    paddingX: 4, // ✅ Readable
    marginY: 2, // ✅ Explicit
  }}
/>
```

❌ **Avoid abbreviations** (per naming conventions best practice):

```typescript
<Box
  sx={{
    p: 2, // ❌ Too terse
    px: 4, // ❌ Not clear
    my: 2, // ❌ What does this mean?
  }}
/>
```

[Full list of shorthand properties](https://mui.com/system/properties/)

## mergeSxProps Utility

For generic components accepting an `sx` prop, use `mergeSxProps` to combine default styles with custom styles:

```typescript
import { mergeSxProps } from "@clipboard-health/ui-react";

<Box
  sx={mergeSxProps(
    (theme) => ({
      backgroundColor: theme.palette.background.tertiary,
      padding: 2,
    }),
    sx // User's custom sx prop
  )}
  {...restProps}
/>;
```

## Theme Access

### Using getTheme

```typescript
import { getTheme } from "@clipboard-health/ui-theme";
import { ThemeProvider } from "@mui/material";

export function Component() {
  const theme = getTheme();

  return <ThemeProvider theme={theme}>{/* Your components */}</ThemeProvider>;
}
```

### Theme Properties

```typescript
const theme = getTheme();

// Colors
theme.palette.primary.main;
theme.palette.secondary.main;
theme.palette.error.main;
theme.palette.text.primary;
theme.palette.background.default;

// Spacing
theme.spacing(1); // 8px
theme.spacing(2); // 16px

// Typography
theme.typography.h1;
theme.typography.body1;

// Breakpoints
theme.breakpoints.up("md");
theme.breakpoints.down("sm");
```

## Modal Patterns

### ❌ Don't Use Modal

```typescript
// Don't
import { Modal } from "@mui/material";
```

### ✅ Use BottomSheet or FullScreenDialog

```typescript
// For mobile-friendly modals
import { BottomSheet } from "@redesign/components/BottomSheet";

// For full-screen views
import { FullScreenDialog } from "@redesign/components/FullScreenDialog";
```

## Layout Components

### Use MUI Layout Components

These are safe to import directly from MUI:

```typescript
import { Box, Stack, Container, Grid } from '@mui/material';

// Stack for vertical/horizontal layouts
<Stack spacing={2} direction="row">
  <Item />
  <Item />
</Stack>

// Box for flexible containers
<Box sx={{ display: 'flex', gap: 2 }}>
  <Child />
</Box>

// Grid for responsive layouts
<Grid container spacing={2}>
  <Grid item xs={12} md={6}>
    <Content />
  </Grid>
</Grid>
```

## MUI Augmentations

### Type Safety

Import MUI theme augmentations to ensure type safety:

```typescript
// At top of file that uses extensive MUI theming
import "@clipboard-health/ui-theme";
import "@clipboard-health/ui-theme/src/lib/colors";
import "@clipboard-health/ui-theme/src/lib/overrides/button";
```

See `muiAugmentations.d.ts` for full list of augmentations.

## Common Patterns

### Card with Custom Styling

```typescript
import { Card, CardContent } from "@mui/material";

<Card
  sx={{
    borderRadius: 2,
    boxShadow: 2,
    "&:hover": {
      boxShadow: 4,
    },
  }}
>
  <CardContent>Content here</CardContent>
</Card>;
```

### Buttons with Theme Colors

```typescript
import { Button } from "@redesign/components/Button";

<Button
  variant="contained"
  color="primary"
  sx={{
    textTransform: "none", // Override uppercase
    fontWeight: "bold",
  }}
>
  Submit
</Button>;
```

### Conditional Styles

```typescript
<Box
  sx={{
    backgroundColor: isActive ? "primary.main" : "grey.200",
    padding: 2,
  }}
>
  {content}
</Box>
```

## Best Practices

- **Check Storybook first** - It's the single source of truth
- **Use theme tokens** - Never hardcode colors/spacing
- **Type-safe access** - Function form: `sx={(theme) => ({...})}`
- **Meaningful tokens** - Semantic names over raw colors
- **Spacing system** - Indices 1-12 (or `theme.spacing(n)`)
- **Use shorthand props** - `paddingX`, `marginY` (full names, not `px`, `my`)
- **Leverage pseudo-classes** - For hover, focus, disabled states
- **Prefer `sx` over direct props** - `sx` takes priority and is more flexible



<!-- Source: .ruler/frontend/testing.md -->

# Testing Standards

## The Testing Trophy Philosophy

Our testing strategy follows the **Testing Trophy** model:

```
        /\_
       /E2E\         ← End-to-End (smallest layer)
      /-----\
     / Integ \       ← Integration (largest layer - FOCUS HERE!)
    /---------\
   /   Unit    \     ← Unit Tests (helpers/utilities only)
  /-------------\
 /    Static     \   ← TypeScript + ESLint (foundation)
```

**Investment Priority:**

1. **Static** (TypeScript/ESLint) - Free confidence, catches typos and type errors
2. **Integration** - Most valuable, test how components work together as users experience them
3. **Unit** - For pure helpers/utilities, NOT UI components
4. **E2E** - Critical user flows only, slow and expensive

**Key Principle:** Test as close to how users interact with your app as possible. Users don't shallow-render components or call functions in isolation - they interact with features.

## Technology Stack

- **Vitest** for test runner
- **@testing-library/react** for component testing
- **@testing-library/user-event** for user interactions
- **Mock Service Worker (MSW)** for API mocking

## Test File Structure

```typescript
import { render, screen, waitFor } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

describe("ComponentName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render correctly", () => {
    render(<Component />);
    expect(screen.getByText("Expected")).toBeInTheDocument();
  });

  it("should handle user interaction", async () => {
    const user = userEvent.setup();
    render(<Component />);

    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(screen.getByText("Success")).toBeInTheDocument();
    });
  });
});
```

## Test Naming Conventions

### Describe Blocks

- Use the component/function name: `describe('ComponentName', ...)`
- Nest describe blocks for complex scenarios

```typescript
describe("ShiftCard", () => {
  describe("when shift is urgent", () => {
    it("should display urgent badge", () => {
      // ...
    });
  });

  describe("when shift is booked", () => {
    it("should show booked status", () => {
      // ...
    });
  });
});
```

### Test Names

- Pattern: `'should [expected behavior] when [condition]'`
- Be descriptive and specific

```typescript
// Good
it("should show loading spinner when data is fetching", () => {});
it("should display error message when API call fails", () => {});
it("should enable submit button when form is valid", () => {});

// Avoid
it("works", () => {});
it("loading state", () => {});
```

## Parameterized Tests

### Using it.each

```typescript
it.each([
  { input: { isUrgent: true }, expected: "URGENT" },
  { input: { isUrgent: false }, expected: "REGULAR" },
])("should return $expected when isUrgent is $input.isUrgent", ({ input, expected }) => {
  expect(getShiftType(input)).toBe(expected);
});
```

### Table-Driven Tests

```typescript
describe("calculateShiftPay", () => {
  it.each([
    { hours: 8, rate: 30, expected: 240 },
    { hours: 10, rate: 25, expected: 250 },
    { hours: 12, rate: 35, expected: 420 },
  ])("should calculate $expected for $hours hours at $rate/hr", ({ hours, rate, expected }) => {
    expect(calculateShiftPay(hours, rate)).toBe(expected);
  });
});
```

## Component Testing (Integration Tests)

Integration tests form the largest part of the Testing Trophy. Test features, not isolated components.

### Rendering Components

```typescript
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

function renderWithProviders(component: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{component}</QueryClientProvider>);
}

it("should render user name", () => {
  renderWithProviders(<UserProfile userId="123" />);
  expect(screen.getByText("John Doe")).toBeInTheDocument();
});
```

### Querying Elements - Priority Order

Follow [Testing Library's query priority](https://testing-library.com/docs/queries/about#priority):

1. **`getByRole`** - Best for accessibility (buttons, links, inputs)
2. **`getByLabelText`** - For form fields with labels
3. **`getByPlaceholderText`** - For inputs without labels
4. **`getByText`** - For non-interactive content
5. **`getByDisplayValue`** - For current input values
6. **`getByAltText`** - For images
7. **`getByTitle`** - Less common
8. **`getByTestId`** - ⚠️ **LAST RESORT** - Use only when no other option exists

```typescript
// ✅ Prefer accessible queries
screen.getByRole("button", { name: /submit/i });
screen.getByLabelText("Email address");
screen.getByText("Welcome back");

// ❌ Avoid CSS selectors and implementation details
screen.getByClassName("user-card"); // Users don't see classes
wrapper.find("UserCard").prop("user"); // Testing implementation
screen.getByTestId("custom-element"); // Last resort only
```

### User Interactions

```typescript
import userEvent from "@testing-library/user-event";

it("should handle form submission", async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();

  render(<Form onSubmit={onSubmit} />);

  // Type in input
  await user.type(screen.getByLabelText("Name"), "John Doe");

  // Click button
  await user.click(screen.getByRole("button", { name: "Submit" }));

  // Assert
  expect(onSubmit).toHaveBeenCalledWith({ name: "John Doe" });
});
```

## Hook Testing (Unit Tests)

Only write unit tests for hooks that contain business logic, not for UI components.

### Using renderHook

```typescript
import { renderHook, waitFor } from "@testing-library/react";

describe("useCustomHook", () => {
  it("should return loading state initially", () => {
    const { result } = renderHook(() => useCustomHook());

    expect(result.current.isLoading).toBe(true);
  });

  it("should return data after loading", async () => {
    const { result } = renderHook(() => useCustomHook());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(expectedData);
  });
});
```

### Testing Hook Updates

```typescript
it("should update when dependencies change", async () => {
  const { result, rerender } = renderHook(({ userId }) => useGetUser(userId), {
    initialProps: { userId: "1" },
  });

  await waitFor(() => {
    expect(result.current.data?.id).toBe("1");
  });

  // Update props
  rerender({ userId: "2" });

  await waitFor(() => {
    expect(result.current.data?.id).toBe("2");
  });
});
```

## MSW (Mock Service Worker)

### Factory Functions Pattern - IMPORTANT

**Always export factory functions, not static handlers**. This allows tests to customize mock responses.

❌ **Don't** export static handlers (ties tests to single response):

```typescript
// Bad - can only return this one mock
export const facilityNotesSuccessScenario = rest.get(
  `${TEST_API_URL}/facilityNotes`,
  async (_, res, ctx) => res(ctx.status(200), ctx.json(mockFacilityNotes))
);
```

✅ **Do** export factory functions (flexible per test):

```typescript
// Good - each test can provide custom data
export const createFacilityNotesTestHandler = (facilityNotes: FacilityNote[]) => {
  return rest.get<string, Record<string, string>, FacilityNotesResponse>(
    `${TEST_API_URL}/facilityNotes/:facilityId`,
    async (_req, res, ctx) => {
      return res(ctx.status(200), ctx.json(facilityNotes));
    }
  );
};

// Export default success scenario for convenience
export const facilityNotesTestHandlers = [createFacilityNotesTestHandler(mockFacilityNotes)];
```

**Usage in tests:**

```typescript
// In test setup
mockApiServer.use(
  createFacilityNotesTestHandler(myCustomFacilityNotes),
  createExtraTimePaySettingsTestHandler({ payload: customSettings })
);
```

**Rationale:** When endpoints need different responses for different test scenarios, factory functions avoid duplication and inline mocks that become hard to maintain.

## Mocking

### Mocking Modules

```typescript
import { vi } from "vitest";
import * as useDefinedWorkerModule from "@src/appV2/Worker/useDefinedWorker";

// Mock entire module
vi.mock("@src/appV2/Worker/useDefinedWorker");

// Spy on specific function
const useDefinedWorkerSpy = vi.spyOn(useDefinedWorkerModule, "useDefinedWorker");
useDefinedWorkerSpy.mockReturnValue(getMockWorker({ id: "123" }));
```

### Mocking Functions

```typescript
it("should call callback on success", async () => {
  const onSuccess = vi.fn();

  render(<Component onSuccess={onSuccess} />);

  await user.click(screen.getByRole("button"));

  await waitFor(() => {
    expect(onSuccess).toHaveBeenCalledWith(expectedData);
  });
});
```

### Mocking API Calls

```typescript
import { vi } from "vitest";

vi.mock("@src/appV2/lib/api", () => ({
  get: vi.fn().mockResolvedValue({
    data: { id: "1", name: "Test" },
  }),
}));
```

## Async Testing

### Using waitFor

```typescript
it("should display data after loading", async () => {
  render(<AsyncComponent />);

  expect(screen.getByText("Loading...")).toBeInTheDocument();

  await waitFor(() => {
    expect(screen.getByText("Data loaded")).toBeInTheDocument();
  });
});
```

### Using findBy Queries

```typescript
it("should display user name", async () => {
  render(<UserProfile />);

  // findBy automatically waits
  const name = await screen.findByText("John Doe");
  expect(name).toBeInTheDocument();
});
```

## Test Organization

### Co-location

- Place test files next to source files
- Use same name with `.test.ts` or `.test.tsx` extension

```
Feature/
├── Component.tsx
├── Component.test.tsx
├── utils.ts
└── utils.test.ts
```

### Test Helpers

- Create test utilities in `testUtils.ts` or `test-utils.ts`
- Reusable mocks in `mocks/` folder

```typescript
// testUtils.ts
export function getMockShift(overrides = {}): Shift {
  return {
    id: "1",
    title: "Test Shift",
    ...overrides,
  };
}
```

## What to Test

### ✅ Do Test

- **Integration tests for features** - Multiple components working together
- **Unit tests for helpers/utilities** - Pure business logic
- **All states** - Loading, success, error
- **User interactions** - Clicks, typing, form submissions
- **Conditional rendering** - Different states/permissions

### ❌ Don't Test

- **UI components in isolation** - Users never shallow-render
- **Implementation details** - Internal state, function calls
- **Third-party libraries** - Trust they're tested
- **Styles/CSS** - Visual regression tests are separate

## Coverage Guidelines

- Aim for high coverage on business logic and utilities
- Don't obsess over 100% coverage on UI components
- **Focus on testing behavior**, not implementation
- If you can't query it the way a user would, you're testing wrong

## Common Patterns

### Testing Loading States

```typescript
it("should show loading state", () => {
  render(<Component />);
  expect(screen.getByRole("progressbar")).toBeInTheDocument();
});
```

### Testing Error States

```typescript
it("should display error message on failure", async () => {
  // Mock API error
  vi.mocked(get).mockRejectedValue(new Error("API Error"));

  render(<Component />);

  expect(await screen.findByText("Error loading data")).toBeInTheDocument();
});
```

### Testing Conditional Rendering

```typescript
it("should show premium badge when user is premium", () => {
  render(<UserCard user={{ ...mockUser, isPremium: true }} />);
  expect(screen.getByText("Premium")).toBeInTheDocument();
});

it("should not show premium badge when user is not premium", () => {
  render(<UserCard user={{ ...mockUser, isPremium: false }} />);
  expect(screen.queryByText("Premium")).not.toBeInTheDocument();
});
```



<!-- Source: .ruler/frontend/typescript.md -->

# TypeScript Standards

## Core Principles

- **Strict mode enabled** - no `any` unless absolutely necessary (document why)
- **Prefer type inference** - let TypeScript infer when possible
- **Explicit return types** for exported functions
- **Zod for runtime validation** - single source of truth for types and validation
- **No type assertions** unless unavoidable (prefer type guards)

## Type vs Interface

Use the right tool for the job:

### Use `interface` for:

- **Component props**
- **Object shapes**
- **Class definitions**
- **Anything that might be extended**

```typescript
// ✅ Good - Interface for props
interface UserCardProps {
  user: User;
  onSelect: (id: string) => void;
  isHighlighted?: boolean;
}

// ✅ Good - Interface can be extended
interface BaseEntity {
  id: string;
  createdAt: string;
}

interface User extends BaseEntity {
  name: string;
  email: string;
}
```

### Use `type` for:

- **Unions**
- **Intersections**
- **Tuples**
- **Derived/conditional types**
- **Type aliases**

```typescript
// ✅ Good - Type for unions
type Status = "pending" | "active" | "completed" | "failed";

// ✅ Good - Type for intersections
type UserWithPermissions = User & { permissions: string[] };

// ✅ Good - Type for tuples
type Coordinate = [number, number];

// ✅ Good - Derived types
type UserKeys = keyof User;
type PartialUser = Partial<User>;
```

## Naming Conventions

### Types and Interfaces

- **Suffix with purpose**: `Props`, `Response`, `Request`, `Options`, `Params`, `State`
- **No `I` or `T` prefix** (we're not in C# or Java)
- **PascalCase** for type names

```typescript
// ✅ Good
interface ButtonProps { ... }
type ApiResponse = { ... };
type UserOptions = { ... };

// ❌ Bad
interface IButton { ... }  // No I prefix
type TResponse = { ... };   // No T prefix
interface buttonprops { ... }  // Wrong case
```

### Boolean Properties

Always prefix with `is`, `has`, `should`, `can`, `will`:

```typescript
// ✅ Good
interface User {
  isActive: boolean;
  hasPermission: boolean;
  shouldNotify: boolean;
  canEdit: boolean;
  willExpire: boolean;
}

// ❌ Bad
interface User {
  active: boolean; // Unclear
  permission: boolean; // Unclear
  notify: boolean; // Unclear
}
```

## Zod Integration

```typescript
// Define schema first
const userSchema = z.object({
  id: z.string(),
  name: z.string(),
});

// Infer type from schema
export type User = z.infer<typeof userSchema>;

// Use for API validation
const response = await get({
  url: "/api/users",
  responseSchema: userSchema,
});
```

## Type Guards

```typescript
export function isEventKey(key: string): key is EventKey {
  return VALID_EVENT_KEYS.includes(key as EventKey);
}
```

## Constants

```typescript
// Use const assertions for readonly values
export const STAGES = {
  DRAFT: "draft",
  PUBLISHED: "published",
} as const;

export type Stage = (typeof STAGES)[keyof typeof STAGES];
```

## Function Types

```typescript
// Explicit return types for exported functions
export function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

// Prefer interfaces for function props
interface HandleSubmitProps {
  userId: string;
  data: FormData;
}

export function handleSubmit(props: HandleSubmitProps): Promise<void> {
  // ...
}
```

## Utility Types

TypeScript provides powerful built-in utility types. Use them:

```typescript
// Partial - Make all properties optional
type PartialUser = Partial<User>;

// Required - Make all properties required
type RequiredUser = Required<User>;

// Readonly - Make all properties readonly
type ReadonlyUser = Readonly<User>;

// Pick - Select specific properties
type UserIdOnly = Pick<User, "id" | "name">;

// Omit - Remove specific properties
type UserWithoutPassword = Omit<User, "password">;

// Record - Create object type with specific key/value types
type UserMap = Record<string, User>;

// NonNullable - Remove null and undefined
type DefinedString = NonNullable<string | null | undefined>; // string

// ReturnType - Extract return type from function
function getUser() { return { id: '1', name: 'John' }; }
type User = ReturnType<typeof getUser>;

// Parameters - Extract parameter types from function
function updateUser(id: string, data: UserData) { ... }
type UpdateUserParams = Parameters<typeof updateUser>; // [string, UserData]
```

## Avoiding `any`

The `any` type defeats the purpose of TypeScript. Use alternatives:

```typescript
// ❌ Bad - Loses all type safety
function process(data: any) {
  return data.value; // No error if value doesn't exist!
}

// ✅ Good - Use unknown for truly unknown types
function process(data: unknown) {
  if (typeof data === "object" && data !== null && "value" in data) {
    return (data as { value: string }).value;
  }
  throw new Error("Invalid data");
}

// ✅ Better - Use generics
function process<T extends { value: string }>(data: T) {
  return data.value; // Type safe!
}

// ✅ Best - Use Zod for runtime validation
const dataSchema = z.object({ value: z.string() });
function process(data: unknown) {
  const parsed = dataSchema.parse(data); // Throws if invalid
  return parsed.value; // Type safe!
}
```

## Generics

Use generics for reusable, type-safe code:

```typescript
// ✅ Good - Generic function
function getFirst<T>(array: T[]): T | undefined {
  return array[0];
}

const firstNumber = getFirst([1, 2, 3]); // number | undefined
const firstName = getFirst(["a", "b"]); // string | undefined

// ✅ Good - Generic component
interface ListProps<T> {
  items: T[];
  renderItem: (item: T) => ReactNode;
  keyExtractor: (item: T) => string;
}

export function List<T>({ items, renderItem, keyExtractor }: ListProps<T>) {
  return (
    <Box>
      {items.map((item) => (
        <Box key={keyExtractor(item)}>{renderItem(item)}</Box>
      ))}
    </Box>
  );
}

// Usage - Type inferred!
<List
  items={users}
  renderItem={(user) => <UserCard user={user} />} // user is User
  keyExtractor={(user) => user.id}
/>;

// ✅ Good - Constrained generics
interface HasId {
  id: string;
}

function findById<T extends HasId>(items: T[], id: string): T | undefined {
  return items.find((item) => item.id === id);
}
```

## Type Guards

Use type guards for runtime type checking:

```typescript
// ✅ Good - Type predicate
export function isUser(value: unknown): value is User {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "name" in value &&
    typeof value.id === "string" &&
    typeof value.name === "string"
  );
}

// Usage
function processData(data: unknown) {
  if (isUser(data)) {
    console.log(data.name); // TypeScript knows data is User
  }
}

// ✅ Better - Use Zod (runtime validation + type guard)
const userSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export function isUser(value: unknown): value is User {
  return userSchema.safeParse(value).success;
}

// ✅ Good - Discriminated unions
type ApiResponse =
  | { status: "success"; data: User }
  | { status: "error"; error: string }
  | { status: "loading" };

function handleResponse(response: ApiResponse) {
  switch (response.status) {
    case "success":
      console.log(response.data); // TypeScript knows data exists
      break;
    case "error":
      console.log(response.error); // TypeScript knows error exists
      break;
    case "loading":
      // TypeScript knows no data or error exists
      break;
  }
}
```

## Const Assertions

Use `as const` for readonly literal types:

```typescript
// ✅ Good - Const assertion for object
export const STATUSES = {
  PENDING: "pending",
  ACTIVE: "active",
  COMPLETED: "completed",
} as const;

// Type: 'pending' | 'active' | 'completed'
export type Status = (typeof STATUSES)[keyof typeof STATUSES];

// ✅ Good - Const assertion for array
export const COLORS = ["red", "blue", "green"] as const;
export type Color = (typeof COLORS)[number]; // 'red' | 'blue' | 'green'

// ❌ Bad - Without const assertion
export const STATUSES = {
  PENDING: "pending", // Type: string (too loose!)
  ACTIVE: "active",
};
```

## Discriminated Unions

Use for state machines and API responses:

```typescript
// ✅ Good - Discriminated union for query state
type QueryState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: Error };

function useQueryState<T>(): QueryState<T> {
  // ...
}

// Usage - Type narrowing works automatically
const state = useQueryState<User>();

if (state.status === "success") {
  console.log(state.data); // TypeScript knows data exists
}

// ✅ Good - Discriminated union for actions
type Action =
  | { type: "SET_USER"; payload: User }
  | { type: "CLEAR_USER" }
  | { type: "UPDATE_USER"; payload: Partial<User> };

function reducer(state: State, action: Action) {
  switch (action.type) {
    case "SET_USER":
      return { ...state, user: action.payload }; // payload is User
    case "CLEAR_USER":
      return { ...state, user: null }; // no payload
    case "UPDATE_USER":
      return { ...state, user: { ...state.user, ...action.payload } };
  }
}
```

## Function Overloads

Use for functions with different parameter/return combinations:

```typescript
// ✅ Good - Function overloads
function formatValue(value: string): string;
function formatValue(value: number): string;
function formatValue(value: Date): string;
function formatValue(value: string | number | Date): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  return value.toISOString();
}

// TypeScript knows the return type based on input
const str1 = formatValue("hello"); // string
const str2 = formatValue(123); // string
const str3 = formatValue(new Date()); // string
```

## Template Literal Types

Use for type-safe string patterns:

```typescript
// ✅ Good - Event names
type EventName = `on${Capitalize<string>}`;

interface Props {
  onClick: () => void; // Valid
  onHover: () => void; // Valid
  // click: () => void; // Error: doesn't match pattern
}

// ✅ Good - Route paths
type Route = `/users/${string}` | `/posts/${string}` | "/";

const validRoute: Route = "/users/123"; // ✅
const invalidRoute: Route = "users/123"; // ❌ Error

// ✅ Good - CSS properties
type CSSProperty = `${"margin" | "padding"}${"Top" | "Bottom" | "Left" | "Right"}`;
// 'marginTop' | 'marginBottom' | 'marginLeft' | 'marginRight' | 'paddingTop' | ...
```

## Mapped Types

Create new types by transforming existing ones:

```typescript
// ✅ Good - Make all properties optional
type Optional<T> = {
  [K in keyof T]?: T[K];
};

// ✅ Good - Make all properties readonly
type Immutable<T> = {
  readonly [K in keyof T]: T[K];
};

// ✅ Good - Add suffix to all keys
type Prefixed<T, P extends string> = {
  [K in keyof T as `${P}${Capitalize<string & K>}`]: T[K];
};

type User = { name: string; age: number };
type PrefixedUser = Prefixed<User, "user">;
// { userName: string; userAge: number }
```

## Type Narrowing

Let TypeScript narrow types automatically:

```typescript
// ✅ Good - Typeof narrowing
function format(value: string | number) {
  if (typeof value === "string") {
    return value.toUpperCase(); // TypeScript knows value is string
  }
  return value.toFixed(2); // TypeScript knows value is number
}

// ✅ Good - Truthiness narrowing
function getLength(value: string | null) {
  if (value) {
    return value.length; // TypeScript knows value is string
  }
  return 0;
}

// ✅ Good - In narrowing
interface Fish {
  swim: () => void;
}
interface Bird {
  fly: () => void;
}

function move(animal: Fish | Bird) {
  if ("swim" in animal) {
    animal.swim(); // TypeScript knows animal is Fish
  } else {
    animal.fly(); // TypeScript knows animal is Bird
  }
}

// ✅ Good - Instanceof narrowing
function handleError(error: unknown) {
  if (error instanceof Error) {
    console.log(error.message); // TypeScript knows error is Error
  }
}
```

## Common Patterns

### Optional Chaining & Nullish Coalescing

```typescript
// ✅ Good - Optional chaining
const userName = user?.profile?.name;

// ✅ Good - Nullish coalescing (only null/undefined, not '')
const displayName = userName ?? "Anonymous";

// ❌ Bad - Logical OR (treats '' and 0 as falsy)
const displayName = userName || "Anonymous";
```

### Non-null Assertion (Use Sparingly)

```typescript
// ⚠️ Use sparingly - Only when you're 100% sure
const user = getUser()!; // Tells TS: trust me, it's not null

// ✅ Better - Handle null case
const user = getUser();
if (!user) throw new Error("User not found");
// Now TypeScript knows user exists
```

## Related Rules

- **Zod Integration**: See `.agents/rules/data-fetching.md` for API validation patterns
- **React Patterns**: See `.agents/rules/react-patterns.md` for component prop types
- **Testing**: See `.agents/rules/testing.md` for test type patterns



<!-- Source: .ruler/frontend/uiAndStyling.md -->

# UI and Styling

- Use Material UI for components and styling and a mobile-first approach.
- Favor TanStack Query over "useEffect".
