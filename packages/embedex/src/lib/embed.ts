import { writeFile } from "node:fs/promises";

import { createDestinationMap } from "./internal/createDestinationMap";
import { createSourceMap } from "./internal/createSourceMap";
import { processDestinations } from "./internal/processDestinations";
import { type EmbedParams, type EmbedResult } from "./types";

/**
 * Embed sources into destinations.
 */
export async function embed(params: Readonly<EmbedParams>): Promise<EmbedResult> {
  const { sourcesGlob: globPattern, cwd, write } = params;
  const sourceMap = await createSourceMap({ cwd, globPattern });
  const destinationMap = await createDestinationMap({ sourceMap });

  const embeds = processDestinations({ cwd, sourceMap, destinationMap });

  await Promise.all(
    embeds.map(async (embed) => {
      if (write && embed.code === "UPDATE") {
        await writeFile(embed.paths.destination, embed.updatedContent);
      }
    }),
  );

  return {
    embeds,
    sources: [...sourceMap.entries()].map(([key, value]) => ({
      path: key,
      destinations: value.destinations,
    })),
    destinations: [...destinationMap.entries()].map(([key, value]) => ({
      path: key,
      sources: [...value.sources],
    })),
  };
}
