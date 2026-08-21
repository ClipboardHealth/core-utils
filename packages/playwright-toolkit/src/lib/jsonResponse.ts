import { isDefined } from "@clipboard-health/util-ts";
import type { Page, Response } from "@playwright/test";

export interface WaitForParsedJsonResponseParams<T> {
  isCandidate: (params: { response: Response }) => boolean;
  page: Page;
  parseCandidate: (params: { body: unknown; response: Response }) => T | undefined;
  timeoutMs: number;
}

/**
 * Waits for a matching JSON response and parses its body while Playwright's
 * document-scoped response resource is still readable. Return `undefined`
 * from `parseCandidate` to keep waiting for another candidate response.
 */
export async function waitForParsedJsonResponse<T>(
  params: WaitForParsedJsonResponseParams<T>,
): Promise<T> {
  const { isCandidate, page, parseCandidate, timeoutMs } = params;
  const parsedCandidates = new WeakMap<Response, T>();

  const response = await page.waitForResponse(
    async (candidateResponse) => {
      if (!isCandidate({ response: candidateResponse })) {
        return false;
      }

      const parsedCandidate = parseCandidate({
        body: await candidateResponse.json(),
        response: candidateResponse,
      });
      if (!isDefined(parsedCandidate)) {
        return false;
      }

      parsedCandidates.set(candidateResponse, parsedCandidate);
      return true;
    },
    { timeout: timeoutMs },
  );
  const parsedResponse = parsedCandidates.get(response);

  if (!isDefined(parsedResponse)) {
    throw new Error(
      "Expected the matched JSON response body to be captured while it was readable.",
    );
  }

  return parsedResponse;
}
