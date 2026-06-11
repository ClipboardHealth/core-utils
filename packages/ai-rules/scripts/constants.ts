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

export const PROFILES = {
  common: { include: ["common"] as const },
  frontend: { include: ["common", "frontend"] as const },
  backend: { include: ["common", "backend"] as const },
  fullstack: { include: ["common", "frontend", "backend"] as const },
  datamodeling: { include: ["datamodeling"] as const },
} as const satisfies Record<string, { include: readonly string[] }>;

export type ProfileName = keyof typeof PROFILES;
