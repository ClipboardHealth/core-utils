import { readFile } from "node:fs/promises";

import type { DestinationPath } from "../types";
import type { DestinationMap, SourceMap } from "./types";

export async function createDestinationMap(
  params: Readonly<{ sourceMap: Readonly<SourceMap> }>,
): Promise<DestinationMap> {
  const { sourceMap } = params;

  const uniqueDestinationPaths = new Set(
    [...sourceMap.values()].flatMap(({ destinations }) => destinations),
  );
  const destinationContents = new Map<DestinationPath, string>();
  await Promise.all(
    [...uniqueDestinationPaths].map(async (path) => {
      destinationContents.set(path, await readFile(path, "utf8"));
    }),
  );

  return new Map(
    [...uniqueDestinationPaths].map((destinationPath) => [
      destinationPath,
      {
        // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style -- guaranteed set above; oxlint no-non-null-assertion forbids !
        content: destinationContents.get(destinationPath) as string,
        sources: new Set(
          [...sourceMap.entries()]
            .filter(([_, { destinations }]) => destinations.includes(destinationPath))
            .map(([sourcePath]) => sourcePath),
        ),
      },
    ]),
  );
}
