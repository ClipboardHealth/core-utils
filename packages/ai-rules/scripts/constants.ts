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
  "common/configuration": "Adding config: secrets, SSM, feature flags, DB vs hardcoded",
  "common/featureFlags": "Creating or managing feature flags: naming, lifecycle, cleanup",
  "common/gitWorkflow": "Writing commit messages, PR titles, or reviewing pull requests",
  "common/loggingObservability":
    "Adding logging, metrics, or observability: levels, structured context, PII",
  "common/testing": "Writing unit tests: conventions, naming, structure",
  "common/typeScript": "Writing any TypeScript code: naming, types, functions, error handling",
  "backend/architecture": "Creating modules, services, controllers: three-tier pattern",
  "backend/asyncMessaging": "Working with queues, async messaging, or background jobs",
  "backend/mongodb": "Working with MongoDB/Mongoose: schemas, indexes, queries",
  "backend/notifications": "Implementing notifications or messaging to users",
  "backend/postgres": "Writing Postgres queries: Prisma, subqueries, feature flags",
  "backend/restApiDesign": "Designing REST APIs: JSON:API, endpoints, responses, contracts",
  "backend/serviceTests": "Writing service-level integration tests",
  "frontend/customHooks": "Creating or refactoring React custom hooks",
  "frontend/dataFetching": "Implementing data fetching: React Query, API calls, caching",
  "frontend/e2eTesting": "Writing E2E tests with Playwright",
  "frontend/errorHandling": "Implementing error handling in React components",
  "frontend/fileOrganization": "Organizing files and folders in a frontend project",
  "frontend/frontendTechnologyStack": "Choosing frontend libraries, frameworks, or tools",
  "frontend/interactiveElements": "Building interactive UI elements: forms, buttons, inputs",
  "frontend/modalRoutes": "Implementing modals or route-based dialogs",
  "frontend/reactComponents": "Writing React components: patterns, props, composition",
  "frontend/styling": "Styling components: CSS, themes, responsive design",
  "frontend/testing": "Writing frontend tests: React Testing Library, component tests",
  "datamodeling/analytics": "Working with analytics data models",
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
