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

// `common` holds rules that apply to any repository; `commonTs` holds those that only make sense
// where application code lives. The split lets `infrastructure` take the former without the
// latter, so a Terraform or CI-tooling repo gets an index in which every rule applies to it.
export const PROFILES = {
  common: { include: ["common", "commonTs"] as const },
  frontend: { include: ["common", "commonTs", "frontend"] as const },
  backend: { include: ["common", "commonTs", "backend", "infrastructure"] as const },
  fullstack: {
    include: ["common", "commonTs", "frontend", "backend", "infrastructure"] as const,
  },
  datamodeling: { include: ["datamodeling"] as const },
  infrastructure: { include: ["common", "infrastructure"] as const },
} as const satisfies Record<string, { include: readonly string[] }>;

export type ProfileName = keyof typeof PROFILES;
