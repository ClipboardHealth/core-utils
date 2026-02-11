import path from "node:path";

const packageRoot = path.join(__dirname, "..");
export const PATHS = {
  packageRoot,
  outputDirectory: path.join(packageRoot, "..", "..", "dist", "packages", "ai-rules"),
};

export const FILES = {
  agents: "AGENTS.md",
  claude: "CLAUDE.md",
} as const;

interface RuleDefinition {
  readonly path: string;
  readonly whenToRead: string;
}

export const RULE_FILES = {
  "common/configuration": {
    path: "common/configuration.md",
    whenToRead: "Adding config: secrets, SSM, feature flags, DB vs hardcoded",
  },
  "common/featureFlags": {
    path: "common/featureFlags.md",
    whenToRead: "Creating or managing feature flags: naming, lifecycle, cleanup",
  },
  "common/gitWorkflow": {
    path: "common/gitWorkflow.md",
    whenToRead: "Writing commit messages, PR titles, or reviewing pull requests",
  },
  "common/loggingObservability": {
    path: "common/loggingObservability.md",
    whenToRead: "Adding logging, metrics, or observability: levels, structured context, PII",
  },
  "common/testing": {
    path: "common/testing.md",
    whenToRead: "Writing unit tests: conventions, naming, structure",
  },
  "common/typeScript": {
    path: "common/typeScript.md",
    whenToRead: "Writing any TypeScript code: naming, types, functions, error handling",
  },
  "backend/architecture": {
    path: "backend/architecture.md",
    whenToRead: "Creating modules, services, controllers: three-tier pattern",
  },
  "backend/asyncMessaging": {
    path: "backend/asyncMessaging.md",
    whenToRead: "Working with queues, async messaging, or background jobs",
  },
  "backend/mongodb": {
    path: "backend/mongodb.md",
    whenToRead: "Working with MongoDB/Mongoose: schemas, indexes, queries",
  },
  "backend/notifications": {
    path: "backend/notifications.md",
    whenToRead: "Implementing notifications or messaging to users",
  },
  "backend/postgres": {
    path: "backend/postgres.md",
    whenToRead: "Writing Postgres queries: Prisma, subqueries, feature flags",
  },
  "backend/restApiDesign": {
    path: "backend/restApiDesign.md",
    whenToRead: "Designing REST APIs: JSON:API, endpoints, responses, contracts",
  },
  "backend/serviceTests": {
    path: "backend/serviceTests.md",
    whenToRead: "Writing service-level integration tests",
  },
  "frontend/customHooks": {
    path: "frontend/customHooks.md",
    whenToRead: "Creating or refactoring React custom hooks",
  },
  "frontend/dataFetching": {
    path: "frontend/dataFetching.md",
    whenToRead: "Implementing data fetching: React Query, API calls, caching",
  },
  "frontend/e2eTesting": {
    path: "frontend/e2eTesting.md",
    whenToRead: "Writing E2E tests with Playwright",
  },
  "frontend/errorHandling": {
    path: "frontend/errorHandling.md",
    whenToRead: "Implementing error handling in React components",
  },
  "frontend/fileOrganization": {
    path: "frontend/fileOrganization.md",
    whenToRead: "Organizing files and folders in a frontend project",
  },
  "frontend/frontendTechnologyStack": {
    path: "frontend/frontendTechnologyStack.md",
    whenToRead: "Choosing frontend libraries, frameworks, or tools",
  },
  "frontend/interactiveElements": {
    path: "frontend/interactiveElements.md",
    whenToRead: "Building interactive UI elements: forms, buttons, inputs",
  },
  "frontend/modalRoutes": {
    path: "frontend/modalRoutes.md",
    whenToRead: "Implementing modals or route-based dialogs",
  },
  "frontend/reactComponents": {
    path: "frontend/reactComponents.md",
    whenToRead: "Writing React components: patterns, props, composition",
  },
  "frontend/styling": {
    path: "frontend/styling.md",
    whenToRead: "Styling components: CSS, themes, responsive design",
  },
  "frontend/testing": {
    path: "frontend/testing.md",
    whenToRead: "Writing frontend tests: React Testing Library, component tests",
  },
  "datamodeling/analytics": {
    path: "datamodeling/analytics.md",
    whenToRead: "Working with analytics data models",
  },
  "datamodeling/castingDbtStagingModels": {
    path: "datamodeling/castingDbtStagingModels.md",
    whenToRead: "Casting data types in dbt staging models",
  },
  "datamodeling/dbtModelDevelopment": {
    path: "datamodeling/dbtModelDevelopment.md",
    whenToRead: "Developing dbt models: naming, structure, testing",
  },
  "datamodeling/dbtYamlDocumentation": {
    path: "datamodeling/dbtYamlDocumentation.md",
    whenToRead: "Writing dbt YAML documentation and schema files",
  },
} as const satisfies Record<string, RuleDefinition>;

export type RuleId = keyof typeof RULE_FILES;

export const CATEGORIES = {
  common: [
    "common/configuration",
    "common/featureFlags",
    "common/gitWorkflow",
    "common/loggingObservability",
    "common/testing",
    "common/typeScript",
  ] as const,
  backend: [
    "backend/architecture",
    "backend/asyncMessaging",
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
