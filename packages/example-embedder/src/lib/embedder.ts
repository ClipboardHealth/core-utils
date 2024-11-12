import { checkExamples } from "./internal/checkExamples";
import { embedExamples } from "./internal/embedExamples";
import { findFilePaths } from "./internal/findFilePaths";
import { targetToExampleMap } from "./internal/targetToExampleMap";

interface EmbedderOptions {
  directory: string;
  check?: boolean;
}

export async function embedder(options: EmbedderOptions): Promise<void> {
  const { directory, check = false } = options;
  const paths = await findFilePaths({ directory, extension: ".ts" });
  const map = await targetToExampleMap(paths);

  if (check) {
    const mismatches = await checkExamples(map);
    if (mismatches.length > 0) {
      const errors = mismatches.map(
        (m) => `Mismatch in file '${m.targetPath}' for example '${m.examplePath}'`,
      );
      throw new Error(errors.join("\n"));
    }
  } else {
    await Promise.all(
      Object.entries(map).map(async ([targetPath, exampleMap]) => {
        await embedExamples(targetPath, exampleMap);
      }),
    );
  }
}
