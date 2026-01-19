import { type either } from "@clipboard-health/util-ts";

export interface SetupError {
  readonly code: string;
  readonly message: string;
}

export interface SetupSuccess {
  readonly message: string;
}

export type SetupResult = either.Either<SetupError, SetupSuccess>;

export interface GithubRelease {
  readonly tag_name: string;
  readonly assets: ReadonlyArray<{
    readonly name: string;
    readonly browser_download_url: string;
  }>;
}

export interface PlatformInfo {
  readonly platform: string;
  readonly arch: string;
}

export function createError(code: string, message: string): SetupError {
  return { code, message };
}
