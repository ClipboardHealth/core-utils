import { writeFile } from "node:fs/promises";

import { createDestinationMap } from "./internal/createDestinationMap";
import { createSourceMap } from "./internal/createSourceMap";
import {
  buildDependencyGraph,
  detectCircularDependency,
  topologicalSort,
} from "./internal/dependencyGraph";
import { processDestinations } from "./internal/processDestinations";
import { type Embed, type EmbedParams, type EmbedResult } from "./types";

/**
 * Embed sources into destinations.
 *
 * Processes destinations in dependency order to handle chained embeds correctly.
 * For example, if A.ts embeds into B.md, and B.md embeds into C.md, then:
 * 1. B.md is processed first (A.ts content is embedded)
 * 2. C.md is processed second (updated B.md content is embedded)
 */
export async function embed(params: Readonly<EmbedParams>): Promise<EmbedResult> {
  const { sourcesGlob, cwd, write } = params;
  const sourceMap = await createSourceMap({ cwd, sourcesGlob });
  const destinationMap = await createDestinationMap({ sourceMap });

  // Build dependency graph to determine processing order
  const graph = buildDependencyGraph({ sourceMap, destinationMap });

  // Check for circular dependencies
  const circularDependency = detectCircularDependency(graph);
  if (circularDependency) {
    const { cycle } = circularDependency;
    /* istanbul ignore next - cycle[0] is always defined in practice */
    const destination = cycle[0] ?? "";
    const embed: Embed = {
      code: "CIRCULAR_DEPENDENCY",
      paths: { destination, sources: [] },
      cycle,
    };
    return {
      embeds: [embed],
      sources: [...sourceMap.entries()].map(([path, { destinations }]) => ({ path, destinations })),
      destinations: [...destinationMap.entries()].map(([path, { sources }]) => ({
        path,
        sources: [...sources],
      })),
    };
  }

  // Get topological sort order for processing
  const sortedDestinations = topologicalSort(graph);

  // Process destinations in dependency order, tracking updated content
  const updatedContentMap = new Map<string, string>();
  const embeds: Embed[] = [];

  for (const destinationPath of sortedDestinations) {
    const destinationEntry = destinationMap.get(destinationPath);
    /* istanbul ignore next */
    if (!destinationEntry) {
      continue;
    }

    const [embed] = processDestinations({
      cwd,
      sourceMap,
      destinationMap: new Map([[destinationPath, destinationEntry]]),
      updatedContentMap,
    });

    /* istanbul ignore next */
    if (!embed) {
      continue;
    }

    embeds.push(embed);

    // Track updated content for chained embeds
    if (embed.code === "UPDATE") {
      updatedContentMap.set(destinationPath, embed.updatedContent);
    }
  }

  await Promise.all(
    embeds.map(async (embed) => {
      if (write && embed.code === "UPDATE") {
        await writeFile(embed.paths.destination, embed.updatedContent);
      }
    }),
  );

  return {
    embeds,
    sources: [...sourceMap.entries()].map(([path, { destinations }]) => ({ path, destinations })),
    destinations: [...destinationMap.entries()].map(([path, { sources }]) => ({
      path,
      sources: [...sources],
    })),
  };
}
