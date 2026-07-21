import type { ServiceError } from "../errors/serviceError";
import { isSuccess, type ServiceResult } from "./serviceResult";

/** A service error with a literal discriminant used for exhaustive matching. */
export type TaggedServiceError = ServiceError & { readonly _tag: string };

/** A handler for every tagged member of a ServiceResult error union. */
export type ServiceResultErrorHandlers<E extends TaggedServiceError> = {
  readonly [Tag in E["_tag"]]: (error: Extract<E, { readonly _tag: Tag }>) => unknown;
};

type ErrorHandlerOutput<Handlers> = {
  readonly [Tag in keyof Handlers]: Handlers[Tag] extends (
    ...arguments_: infer _Arguments
  ) => infer Output
    ? Output
    : never;
}[keyof Handlers];

type ExactErrorHandlers<
  E extends TaggedServiceError,
  Handlers extends ServiceResultErrorHandlers<E>,
> = Handlers & Record<Exclude<keyof Handlers, E["_tag"]>, never>;

type LiteralErrorTagConstraint<E extends TaggedServiceError> = string extends E["_tag"]
  ? never
  : unknown;

/**
 * Exhaustively maps a ServiceResult with tagged errors to a single output value.
 *
 * Adding a member to the error union requires adding its `_tag` handler before
 * the call will compile.
 *
 * @throws {TypeError} If a runtime caller omits the handler for a failure's tag.
 */
export function matchServiceResult<
  A,
  E extends TaggedServiceError,
  SuccessOutput,
  const Handlers extends ServiceResultErrorHandlers<E>,
>(
  result: ServiceResult<A, E> & LiteralErrorTagConstraint<E>,
  options: {
    readonly onSuccess: (value: A) => SuccessOutput;
    readonly onError: ExactErrorHandlers<E, Handlers>;
  },
): SuccessOutput | ErrorHandlerOutput<Handlers> {
  if (isSuccess(result)) {
    return options.onSuccess(result.value);
  }

  // TypeScript cannot correlate an indexed handler with the matching member of
  // a discriminated union. ExactErrorHandlers guarantees this relationship.
  const handlers = options.onError as ServiceResultErrorHandlers<E>;
  const handler = handlers[result.error._tag as E["_tag"]] as
    | ((error: E) => ErrorHandlerOutput<Handlers>)
    | undefined;

  if (handler === undefined) {
    throw new TypeError(`Missing ServiceResult error handler for ${result.error._tag}`);
  }

  return handler(result.error);
}
