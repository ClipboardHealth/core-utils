import { mkdir, rm } from "node:fs/promises";

import { buildProfile } from "./buildProfile";
import { PATHS, type ProfileName, PROFILES } from "./constants";

const { outputDirectory } = PATHS;

export async function buildProfiles(params: { timeout: number; verbose: boolean }) {
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });

  return await Promise.all(
    Object.entries(PROFILES).map(
      async ([profileName, categories]) =>
        await buildProfile({
          ...params,
          categories,
          profileName: profileName as ProfileName,
        }),
    ),
  );
}
