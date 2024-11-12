import { readdir } from "node:fs/promises";
import { join } from "node:path/posix";

export interface FindExamplesParams {
  directory: string;
  extension: string;
}

export async function findFilePaths(params: FindExamplesParams): Promise<readonly string[]> {
  const { directory, extension } = params;
  const items = await readdir(directory, { withFileTypes: true });
  const result = await Promise.all(
    items.map(async (item) => {
      const path = join(directory, item.name);
      if (item.isDirectory()) {
        return await findFilePaths({ directory: path, extension });
      }

      return item.isFile() && path.endsWith(extension) ? [path] : [];
    }),
  );

  return result.flat();
}
