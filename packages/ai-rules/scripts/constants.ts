import path from "node:path";

const PACKAGE_ROOT = path.join(__dirname, "..");
export const PATHS = {
  packageRoot: PACKAGE_ROOT,
  outputDirectory: path.join(PACKAGE_ROOT, "..", "..", "dist", "packages", "ai-rules"),
};

export const FILES = {
  agents: "AGENTS.md",
  claude: "CLAUDE.md",
} as const;

export const RULE_FILES = {
  "common/configuration":
    "Adding config, secrets, or third-party dependencies: SSM, LaunchDarkly, DB, NPM packages",
  "common/coreLibraries":
    "Adding dependencies or implementing functionality that may exist in a @clipboard-health/* library",
  "common/featureFlags":
    "Creating or managing feature flags: naming, lifecycle, SDK usage, Zod schemas",
  "common/gitWorkflow": "Writing commit messages, PR titles, or reviewing pull requests",
  "common/loggingObservability":
    "Adding logging, metrics, monitoring, or observability: levels, context, PII, Datadog",
  "common/testing": "Writing unit tests: conventions, naming, structure",
  "common/typeScript": "Writing ANY TypeScript code",
  "backend/architecture":
    "Structuring NestJS modules, services, repos: three-tier, microservices, ts-rest contracts",
  "backend/asyncMessaging": "Working with queues, async messaging, or background jobs",
  "backend/mongodb":
    "Working with MongoDB/Mongoose: schemas, indexes, queries, transactions, migrations",
  "backend/notifications":
    "Implementing notifications via Knock: push notifications, deep links, workflow design",
  "backend/postgres":
    "Working with Postgres: column types, schema changes, query patterns, Prisma TypedSQL",
  "backend/restApiDesign":
    "Designing REST APIs: JSON:API, auth, validation, pagination, ts-rest contracts, DTOs",
  "backend/infrastructure": "Provisioning infrastructure: Terraform, Docker, ECS, DNS",
  "backend/serviceTests":
    "Writing service tests: test data, background jobs, bug handling, migrations",
  "frontend/customHooks":
    "Creating React custom hooks: naming, structure, shared state with constate",
  "frontend/dataFetching": "Implementing data fetching: React Query, API calls, caching",
  "frontend/e2eTesting": "Writing E2E tests with Playwright",
  "frontend/errorHandling":
    "Handling errors in React: component, mutation (meta pattern), Zod validation",
  "frontend/fileOrganization": "Organizing files and folders in a frontend project",
  "frontend/frontendTechnologyStack": "Choosing frontend libraries, frameworks, or tools",
  "frontend/interactiveElements":
    "Adding interactive elements: semantic HTML, a11y, keyboard accessibility",
  "frontend/modalRoutes": "Implementing modals or route-based dialogs",
  "frontend/reactComponents":
    "Writing React components: structure, composition, navigation, Storybook, inline JSX",
  "frontend/styling": "Styling components with MUI sx prop: theme tokens, spacing, no CSS/SCSS",
  "frontend/testing": "Writing frontend tests: React Testing Library, component tests",
  "datamodeling/analytics":
    "Querying analytics data: dbt-mcp, Snowflake, source columns, output formatting",
  "datamodeling/castingDbtStagingModels": "Casting data types in dbt staging models",
  "datamodeling/dbtModelDevelopment": "Developing dbt models: naming, structure, testing",
  "datamodeling/dbtYamlDocumentation": "Writing dbt YAML documentation and schema files",
} as const satisfies Record<string, string>;

export type RuleId = keyof typeof RULE_FILES;

export function toRulePath(ruleId: RuleId): string {
  return `${ruleId}.md`;
}

export const CATEGORIES = {
  common: [
    "common/configuration",
    "common/coreLibraries",
    "common/featureFlags",
    "common/gitWorkflow",
    "common/loggingObservability",
    "common/testing",
    "common/typeScript",
  ] as const,
  backend: [
    "backend/architecture",
    "backend/asyncMessaging",
    "backend/infrastructure",
    "backend/mongodb",
    "backend/notifications",
    "backend/postgres",
    "backend/restApiDesign",
    "backend/serviceTests",
  ] as const,
  frontend: [
    "frontend/customHooks",
    "frontend/dataFetching",
    "frontend/e2eTesting",
    "frontend/errorHandling",
    "frontend/fileOrganization",
    "frontend/frontendTechnologyStack",
    "frontend/interactiveElements",
    "frontend/modalRoutes",
    "frontend/reactComponents",
    "frontend/styling",
    "frontend/testing",
  ] as const,
  datamodeling: [
    "datamodeling/analytics",
    "datamodeling/castingDbtStagingModels",
    "datamodeling/dbtModelDevelopment",
    "datamodeling/dbtYamlDocumentation",
  ] as const,
} as const satisfies Record<string, readonly RuleId[]>;

export type CategoryName = keyof typeof CATEGORIES;

export const PROFILES = {
  common: { include: ["common"] as const },
  frontend: { include: ["common", "frontend"] as const },
  backend: { include: ["common", "backend"] as const },
  fullstack: { include: ["common", "frontend", "backend"] as const },
  datamodeling: { include: ["datamodeling"] as const },
} as const satisfies Record<string, { include: readonly CategoryName[] }>;

export type ProfileName = keyof typeof PROFILES;
