import { type EmbedResult } from "../lib/types";

// eslint-disable-next-line sonarjs/cognitive-complexity
export function processResult(params: { check: boolean; dryRun: boolean; result: EmbedResult[] }): {
  isError: boolean;
  message: string;
} {
  const { check, dryRun, result } = params;

  for (const { code, paths } of result) {
    if (check) {
      if (code === "NO_MATCH") {
        return { isError: true, message: `[${paths.target}] No embed targets found` };
      }

      if (code === "UPDATED") {
        return {
          isError: true,
          message: `[${paths.target}] Embed required ${paths.examples.join(", ")}`,
        };
      }
    }

    if (dryRun) {
      if (code === "NO_MATCH") {
        return {
          isError: false,
          message: `[${paths.target}] Would fail; no embed targets found`,
        };
      }

      if (code === "UPDATED") {
        return {
          isError: false,
          message: `[${paths.target}] Would embed ${paths.examples.join(", ")}`,
        };
      }

      if (code === "NO_CHANGE") {
        return { isError: false, message: `[${paths.target}] No changes` };
      }
    }

    if (code === "NO_MATCH") {
      return { isError: true, message: `[${paths.target}] No embed targets found` };
    }

    if (code === "UPDATED") {
      return {
        isError: false,
        message: `[${paths.target}] Embedded ${paths.examples.join(", ")}`,
      };
    }
  }

  return { isError: false, message: "" };
}
