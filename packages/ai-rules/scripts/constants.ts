import { join } from "node:path";

const packageRoot = join(__dirname, "..");
export const PATHS = {
  packageRoot,
  outputDirectory: join(packageRoot, "..", "..", "dist", "packages", "ai-rules"),
};

export const PROFILES = {
  frontend: ["common", "frontend"] as const,
  backend: ["common", "backend"] as const,
  fullstack: ["common", "frontend", "backend"] as const,
  common: ["common"] as const,
} as const;

export type ProfileName = keyof typeof PROFILES;
