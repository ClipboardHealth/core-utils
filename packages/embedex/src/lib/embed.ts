import { writeFile } from "node:fs/promises";

import { createExampleMap } from "./internal/createExampleMap";
import { createTargetMap } from "./internal/createTargetMap";
import { processTargets } from "./internal/processTargets";
import { type EmbedParams, type EmbedResult } from "./types";

/**
 * Command-line interface (CLI) to embed examples into TypeDoc comments.
 */
export async function embed(params: Readonly<EmbedParams>): Promise<EmbedResult[]> {
  const { globPattern, root, write } = params;
  const exampleMap = await createExampleMap({ globPattern, root });
  const targetMap = await createTargetMap({ exampleMap });
  const result = processTargets({ exampleMap, root, targetMap });

  await Promise.all(
    result.map(async (r) => {
      if (write && r.code === "UPDATED") {
        await writeFile(r.paths.target, r.updatedContent);
      }
    }),
  );

  return result;
}
