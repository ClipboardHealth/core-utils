import type { APIPromise } from "@knocklabs/node";

/**
 * Knock returns a unique ID for every API request in this response header. Include it in logs so
 * that, given one of our log entries, you can find the matching Knock API log entry, along with
 * Knock's view of the request and response bodies, in Knock's dashboard under Observability > Logs.
 *
 * @see {@link https://docs.knock.app/developer-tools/api-logs}
 */
const REQUEST_ID_HEADER = "x-request-id";

/**
 * Awaits a call to Knock, returning its parsed response alongside Knock's request ID.
 *
 * Pass the SDK's promise directly instead of wrapping it in an `async` function, which would
 * discard the raw HTTP response the request ID comes from. Knock sends the header on every
 * response, so `knockRequestId` is only `undefined` if Knock stops doing so.
 */
export async function withKnockRequestId<T>(promise: APIPromise<T>): Promise<{
  knockRequestId: string | undefined;
  response: T;
}> {
  // Await the body first so a failed request throws here rather than from `asResponse`. Both read
  // the same settled request, so this costs no extra round trip.
  const response = await promise;
  const rawResponse = await promise.asResponse();

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

function toRequestId(headers: Headers): string | undefined {
  return headers.get(REQUEST_ID_HEADER) ?? undefined;
}
