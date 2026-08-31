import type { APIPromise } from "@knocklabs/node";

/**
 * Knock returns a unique ID for every API request in this response header. Include it in logs so
 * that, given one of our log entries, you can find the matching Knock API log entry, along with
 * Knock's view of the request and response bodies, in Knock's dashboard under Observability > Logs.
 *
 * @see {@link https://docs.knock.app/developer-tools/api-logs}
 */
const REQUEST_ID_HEADER = "x-request-id";

/** Derived from Knock's SDK so an upgrade that drops `asResponse` fails the build. */
type RawResponse = Pick<APIPromise<unknown>, "asResponse">;

/**
 * Awaits a call to Knock, returning its parsed response alongside Knock's request ID.
 *
 * Pass the provider's promise directly instead of wrapping it in an `async` function; the raw HTTP
 * response, and therefore the request ID, is only reachable through the promise Knock's SDK
 * returns. `knockRequestId` is `undefined` for promises that don't expose the raw HTTP response,
 * which is the case when tests mock the provider.
 */
export async function withKnockRequestId<T>(promise: Promise<T>): Promise<{
  knockRequestId: string | undefined;
  response: T;
}> {
  if (!hasRawResponse(promise)) {
    return { knockRequestId: undefined, response: await promise };
  }

  const [response, rawResponse] = await Promise.all([promise, promise.asResponse()]);

  return { knockRequestId: toRequestId(rawResponse.headers), response };
}

/**
 * Reads Knock's request ID from the response headers Knock's SDK attaches to the errors it throws.
 */
export function toKnockRequestId(error: Error): string | undefined {
  return "headers" in error && error.headers instanceof Headers
    ? toRequestId(error.headers)
    : undefined;
}

function hasRawResponse<T>(promise: Promise<T>): promise is Promise<T> & RawResponse {
  return "asResponse" in promise && typeof promise.asResponse === "function";
}

function toRequestId(headers: Headers): string | undefined {
  return headers.get(REQUEST_ID_HEADER) ?? undefined;
}
