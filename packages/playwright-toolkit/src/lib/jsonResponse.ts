import { isDefined, toError } from "@clipboard-health/util-ts";
import { errors, type Page, type Response } from "@playwright/test";

const MAX_RESPONSE_BODY_LOSS_DIAGNOSTICS = 3;
const RESPONSE_BODY_METHOD_SIGNATURE = "Protocol error (Network.getResponseBody):";
const RESPONSE_BODY_LOSS_MESSAGE = "No resource with given identifier found";

export interface WaitForParsedJsonResponseParams<T> {
  isCandidate: (params: { response: Response }) => boolean;
  page: Page;
  parseCandidate: (params: { body: unknown; response: Response }) => T | undefined;
  timeoutMs: number;
}

interface ParsedCandidate<T> {
  value: T;
}

/**
 * Waits for a matching JSON response and parses its body while Playwright's
 * document-scoped response resource is still readable. If Chromium discards
 * only that candidate's response body during the read, the unchanged waiter
 * continues. Return `undefined` from `parseCandidate` to keep waiting for
 * another candidate response.
 */
export async function waitForParsedJsonResponse<T>(
  params: WaitForParsedJsonResponseParams<T>,
): Promise<T> {
  const { isCandidate, page, parseCandidate, timeoutMs } = params;
  const parsedCandidates = new WeakMap<Response, ParsedCandidate<T>>();
  const responseBodyLossDiagnostics = new Set<string>();
  let responseBodyLossCount = 0;

  let response: Response;
  try {
    response = await page.waitForResponse(
      async (candidateResponse) => {
        if (!isCandidate({ response: candidateResponse })) {
          return false;
        }

        let body: unknown;
        try {
          body = await candidateResponse.json();
        } catch (error) {
          if (!isResponseBodyLoss({ error })) {
            throw error;
          }

          responseBodyLossCount += 1;
          if (responseBodyLossDiagnostics.size < MAX_RESPONSE_BODY_LOSS_DIAGNOSTICS) {
            responseBodyLossDiagnostics.add(
              formatResponseBodyLossDiagnostic({ response: candidateResponse }),
            );
          }
          return false;
        }

        const parsedCandidate = parseCandidate({
          body,
          response: candidateResponse,
        });
        // JSON null is a valid parsed value; only undefined means "keep waiting".
        if (parsedCandidate === undefined) {
          return false;
        }

        parsedCandidates.set(candidateResponse, { value: parsedCandidate });
        return true;
      },
      { timeout: timeoutMs },
    );
  } catch (error) {
    if (!(error instanceof errors.TimeoutError) || responseBodyLossCount === 0) {
      throw error;
    }

    throw createResponseBodyLossTimeoutError({
      diagnostics: [...responseBodyLossDiagnostics],
      responseBodyLossCount,
      timeoutError: error,
    });
  }
  const parsedResponse = parsedCandidates.get(response);

  if (!isDefined(parsedResponse)) {
    throw new Error(
      "Expected the matched JSON response body to be captured while it was readable.",
    );
  }

  return parsedResponse.value;
}

function createResponseBodyLossTimeoutError(params: {
  diagnostics: string[];
  responseBodyLossCount: number;
  timeoutError: Error;
}): Error {
  const { diagnostics, responseBodyLossCount, timeoutError } = params;
  return new Error(
    `${timeoutError.message}\nResponse body loss diagnostics: count=${responseBodyLossCount}; candidates=${diagnostics.join(
      ", ",
    )}`,
    { cause: timeoutError },
  );
}

function formatResponseBodyLossDiagnostic(params: { response: Response }): string {
  const { response } = params;

  return [
    `method=${getResponseMethod({ response })}`,
    `status=${getResponseStatus({ response })}`,
    `path=${getResponsePathTemplate({ response })}`,
  ].join(" ");
}

function getResponseMethod(params: { response: Response }): string {
  try {
    const method = params.response.request().method();
    return /^[A-Za-z]{1,16}$/.test(method) ? method.toUpperCase() : "[redacted]";
  } catch {
    return "[unavailable]";
  }
}

function getResponsePathTemplate(params: { response: Response }): string {
  try {
    return new URL(params.response.url()).pathname === "/" ? "/" : "/[redacted-path]";
  } catch {
    return "/[redacted-path]";
  }
}

function getResponseStatus(params: { response: Response }): string {
  try {
    const status = params.response.status();
    return Number.isInteger(status) && status >= 100 && status <= 599
      ? String(status)
      : "[unavailable]";
  } catch {
    return "[unavailable]";
  }
}

function isResponseBodyLoss(params: { error: unknown }): boolean {
  const { error } = params;
  const message = toError(error).message;

  return (
    message.includes(RESPONSE_BODY_METHOD_SIGNATURE) && message.includes(RESPONSE_BODY_LOSS_MESSAGE)
  );
}
