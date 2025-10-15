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
import { logEvent } from '@/lib/analytics';
import { APP_EVENTS } from '@/constants/events';

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
  },
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
