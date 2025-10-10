# React Component Patterns

## Core Principles

- **Storybook is the single source of truth** for UI components, not Figma
- **Named exports only** (prefer named exports over default exports)
- **Explicit types** for all props and return values
- **Handle all states**: loading, error, empty, success
- **Composition over configuration** - prefer children over complex props

## Component Structure

Follow this consistent structure for all components:

```typescript
// 1. Imports (grouped with blank lines between groups)
import { useState, useMemo, useCallback } from "react";
import { Box, Typography } from "@mui/material";

import { useGetUser } from "@/api/hooks/useGetUser";
import { formatDate } from "@/utils/date";

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

- **PascalCase** for components: `UserProfile`, `DataCard`
- **camelCase** for hooks and utilities: `useUserData`, `formatDate`
- Prefer named exports over default exports for better refactoring support

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
- Example: Wrapping a third-party Button with custom link handling

```typescript
import {
  Button as ButtonBase,
  type ButtonProps as ButtonPropsBase,
} from "@some-ui-library/components";
import { type LocationState } from "history";

import { InternalLink } from "./InternalLink";

interface ButtonProps extends Omit<ButtonPropsBase, "LinkComponent"> {
  locationState?: LocationState;
}

export function Button(props: ButtonProps) {
  return <ButtonBase {...props} LinkComponent={InternalLink} />;
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
export function ItemCard({ item }: { item: Item }) {
  // ✅ Good - Early returns for invalid states
  if (!item) return null;
  if (item.isDeleted) return null;

  // ✅ Good - Ternary for simple either/or
  const statusColor = item.isUrgent ? "error" : "default";

  return (
    <Box>
      <Typography color={statusColor}>{item.title}</Typography>

      {/* ✅ Good - && for optional elements */}
      {item.isFeatured && <FeaturedBadge />}

      {/* ✅ Good - Ternary for alternate content */}
      {item.isAvailable ? <AvailableStatus /> : <UnavailableStatus />}

      {/* ❌ Bad - Nested ternaries (hard to read) */}
      {item.status === "urgent" ? (
        <UrgentBadge />
      ) : item.status === "normal" ? (
        <NormalBadge />
      ) : (
        <DefaultBadge />
      )}

      {/* ✅ Good - Extract to variable or switch */}
      <StatusBadge status={item.status} />
    </Box>
  );
}
```

## Performance Optimization

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