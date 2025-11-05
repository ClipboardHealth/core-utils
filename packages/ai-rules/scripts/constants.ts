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

export const PROFILES = {
  frontend: ["common", "frontend"] as const,
  backend: ["common", "backend"] as const,
  fullstack: ["common", "frontend", "backend"] as const,
  common: ["common"] as const,
} as const;

export type ProfileName = keyof typeof PROFILES;
