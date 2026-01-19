# Error Handling

## Component Level

```typescript
export function DataComponent() {
  const { data, isLoading, isError, refetch } = useGetData();

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={refetch} />;

  return <DataDisplay data={data} />;
}
```

## Mutation Level

```typescript
useMutation({
  mutationFn: createItem,
  onSuccess: () => showSuccessToast("Created"),
  onError: (error) => {
    logError("CREATE_FAILURE", error);
    showErrorToast("Failed to create");
  },
});
```

## Validation

```typescript
try {
  const validated = formSchema.parse(formData);
} catch (error) {
  if (error instanceof z.ZodError) {
    error.errors.forEach((err) => showFieldError(err.path.join("."), err.message));
  }
}
```
