# Error Handling Standards

## React Query Error Handling

```typescript
useQuery({
  queryKey: ["resource"],
  queryFn: fetchResource,
  useErrorBoundary: (error) => {
    // Show error boundary for 500s, not 404s
    return !(axios.isAxiosError(error) && error.response?.status === 404);
  },
  retry: (failureCount, error) => {
    // Don't retry 4xx errors
    if (axios.isAxiosError(error) && error.response?.status < 500) return false;
    return failureCount < 3;
  },
});
```

## Component Error States

```typescript
export function DataComponent() {
  const { data, isLoading, isError, refetch } = useGetData();

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={refetch} />;

  return <DataDisplay data={data} />;
}
```

## Mutation Error Handling

```typescript
export function useCreateDocument() {
  return useMutation({
    mutationFn: createDocumentApi,
    onSuccess: () => {
      queryClient.invalidateQueries(["documents"]);
      showSuccessToast("Document created");
    },
    onError: (error) => {
      logError("CREATE_DOCUMENT_FAILURE", error);
      showErrorToast("Failed to create document");
    },
  });
}
```

## Validation Errors

```typescript
// Zod validation
const formSchema = z.object({
  email: z.string().email("Invalid email"),
  age: z.number().min(18, "Must be 18+"),
});

try {
  const validated = formSchema.parse(formData);
} catch (error) {
  if (error instanceof z.ZodError) {
    error.errors.forEach((err) => showFieldError(err.path.join("."), err.message));
  }
}
```

## Error Boundaries

```typescript
export class ErrorBoundary extends Component<Props, State> {
  state = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logEvent("ERROR_BOUNDARY", { error: error.message });
  }

  render() {
    return this.state.hasError ? <ErrorFallback /> : this.props.children;
  }
}
```

## Best Practices

- **Always handle errors** - Check `isError` state
- **User-friendly messages** - Don't show technical errors
- **Log for debugging** - Include context
- **Provide recovery actions** - Retry, dismiss, navigate
- **Different strategies** - Error boundary vs inline vs retry
