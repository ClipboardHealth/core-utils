import { type either } from "@clipboard-health/util-ts";

export interface SetupError {
  readonly code: string;
  readonly message: string;
}

export interface SetupSuccess {
  readonly message: string;
}

export type SetupResult = either.Either<SetupError, SetupSuccess>;
