import { randomBytes } from "node:crypto";

import type {
  Fixtures,
  PlaywrightTestArgs,
  PlaywrightTestOptions,
  PlaywrightWorkerArgs,
  PlaywrightWorkerOptions,
} from "@playwright/test";

const INVALID_TRACE_ID = "00000000000000000000000000000000";
const INVALID_PARENT_ID = "0000000000000000";

export interface TraceparentFixtures {
  traceparent: string;
}

export interface TraceparentContextLike {
  setExtraHTTPHeaders(headers: Record<string, string>): Promise<void>;
}

export interface TraceparentTestInfoLike {
  annotations: Array<{ type: string; description?: string }>;
}

export interface CreateTraceparentParams {
  randomBytesImplementation?: (byteCount: number) => Uint8Array;
}

export interface InstallTraceparentForTestParams {
  context: TraceparentContextLike;
  testInfo: TraceparentTestInfoLike;
  traceparent?: string;
  existingHeaders?: Record<string, string> | undefined;
}

/**
 * Creates an auto fixture that installs one W3C traceparent per Playwright
 * test and records it as a test annotation for reporter/APM correlation.
 */
export function createTraceparentFixtures(
  params: CreateTraceparentParams = {},
): Fixtures<
  TraceparentFixtures,
  Record<never, never>,
  PlaywrightTestArgs & PlaywrightTestOptions,
  PlaywrightWorkerArgs & PlaywrightWorkerOptions
> {
  return {
    traceparent: [
      async ({ context, extraHTTPHeaders }, use, testInfo) => {
        const result = await installTraceparentForTest({
          context,
          existingHeaders: extraHTTPHeaders,
          testInfo,
          traceparent: createTraceparent(params),
        });

        await use(result.traceparent);
      },
      { auto: true },
    ],
  };
}

export function createTraceparent(params: CreateTraceparentParams = {}): string {
  const randomBytesImplementation = params.randomBytesImplementation ?? randomBytes;
  const traceId = createNonZeroHex({
    byteCount: 16,
    invalidValue: INVALID_TRACE_ID,
    randomBytesImplementation,
  });
  const parentId = createNonZeroHex({
    byteCount: 8,
    invalidValue: INVALID_PARENT_ID,
    randomBytesImplementation,
  });

  return `00-${traceId}-${parentId}-01`;
}

export async function installTraceparentForTest(
  params: InstallTraceparentForTestParams,
): Promise<{ traceparent: string }> {
  const traceparent = params.traceparent ?? createTraceparent();

  await params.context.setExtraHTTPHeaders({
    ...params.existingHeaders,
    traceparent,
  });
  params.testInfo.annotations.push({
    type: "traceparent",
    description: traceparent,
  });

  return { traceparent };
}

function createNonZeroHex(params: {
  byteCount: number;
  invalidValue: string;
  randomBytesImplementation: (byteCount: number) => Uint8Array;
}): string {
  for (;;) {
    const value = Buffer.from(params.randomBytesImplementation(params.byteCount)).toString("hex");

    if (value.length !== params.byteCount * 2) {
      throw new Error(`Random byte source returned ${value.length / 2} bytes`);
    }

    if (value !== params.invalidValue) {
      return value;
    }
  }
}
