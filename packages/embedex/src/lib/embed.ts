import { writeFile } from "node:fs/promises";

import { createExampleMap } from "./internal/createExampleMap";
import { createTargetMap } from "./internal/createTargetMap";
import { processTargets } from "./internal/processTargets";
import { type EmbedParams, type EmbedResult } from "./types";

/**
 * Embed examples into TypeDoc comments.
 */
export async function embed(params: Readonly<EmbedParams>): Promise<EmbedResult> {
  const { examplesGlob: globPattern, cwd, write } = params;
  const exampleMap = await createExampleMap({ globPattern, cwd });
  const targetMap = await createTargetMap({ exampleMap });

  const embeds = processTargets({ exampleMap, cwd, targetMap });

  await Promise.all(
    embeds.map(async (embed) => {
      if (write && embed.code === "UPDATE") {
        await writeFile(embed.paths.target, embed.updatedContent);
      }
    }),
  );

  return {
    embeds,
    examples: [...exampleMap.entries()].map(([key, value]) => ({
      path: key,
      targets: value.targets,
    })),
    targets: [...targetMap.entries()].map(([key, value]) => ({
      path: key,
      examples: [...value.examples],
    })),
  };
}
