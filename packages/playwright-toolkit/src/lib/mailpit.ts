import { isNil, isRecord, toErrorMessage as getErrorMessage } from "@clipboard-health/util-ts";

import { RetryError, type RetrySuccess, runWithRetry, type RunWithRetryParams } from "./retry";
import { isRetryableHttpStatus } from "./setupRetry";

const DEFAULT_MAILPIT_BASE_URL = "https://mailpit.tools.cbh.rocks/api/v1";
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_POLL_INTERVAL_MS = 1000;
const SENT_AFTER_TOLERANCE_MS = 30_000;
const MAX_MESSAGES_TO_FETCH = 3;

export interface MailpitAddress {
  Address: string;
  Name: string;
}

export interface MailpitMessageHeaders {
  ID: string;
  From: MailpitAddress;
  To: MailpitAddress[];
  Subject: string;
}

export interface MailpitMessageSummary extends MailpitMessageHeaders {
  Created?: string | null | undefined;
}

export interface MailpitMessage extends MailpitMessageHeaders {
  Date: string;
  Text: string;
  HTML: string;
}

export interface MailpitClient {
  searchMessages(params: { query: string }): Promise<MailpitMessageSummary[]>;
  getMessage(params: { messageId: string }): Promise<MailpitMessage>;
}

export interface CreateMailpitClientParams {
  password: string;
  username?: string | undefined;
  baseUrl?: string | undefined;
  fetchImplementation?: typeof fetch | undefined;
  requestTimeoutMs?: number | undefined;
}

export interface MailpitPollingDiagnostics {
  searchAttempts: number;
  rawResultCount: number;
  postSentAfterCandidateCount: number;
  invalidOrMissingTimestampCount: number;
  fetchedMessageCount: number;
  extractionMissCount: number;
  excludedValueCount: number;
  transientRequestErrorCount: number;
  transientRequestErrorStatuses: string[];
  newestCandidateTimestamp: string | undefined;
}

export interface FetchMailpitValueResult {
  value: string;
  messageId: string;
  messageCreatedAt: string | undefined;
  pollingDiagnostics: MailpitPollingDiagnostics;
}

export interface FetchMailpitValueParams {
  client: MailpitClient;
  email: string;
  extractValue: (params: { message: MailpitMessage }) => string | undefined;
  valueLabel: string;
  timeoutMs?: number | undefined;
  pollIntervalMs?: number | undefined;
  sentAfter?: Date | undefined;
  excludedValues?: readonly string[] | undefined;
  sleepImplementation?: ((params: { durationMs: number }) => Promise<void>) | undefined;
  nowImplementation?: (() => number) | undefined;
}

type MailpitPollParams = Omit<
  FetchMailpitValueParams,
  "excludedValues" | "extractValue" | "valueLabel"
>;

export type FetchMagicLinkFromMailpitParams = MailpitPollParams & {
  excludeLinks?: readonly string[] | undefined;
};

export type FetchEmailOtpCodeFromMailpitParams = MailpitPollParams & {
  excludeCodes?: readonly string[] | undefined;
};

interface MailpitRequestErrorParams {
  message: string;
  status?: number | undefined;
  cause?: unknown;
  isTransient?: boolean | undefined;
}

interface MailpitPollingSnapshot {
  searchAttempts: number;
  rawResultCount: number;
  postSentAfterCandidateCount: number;
  invalidOrMissingTimestampCount: number;
  fetchedMessageCount: number;
  extractionMissCount: number;
  excludedValueCount: number;
  transientRequestErrorCount: number;
  transientRequestErrorStatuses: Set<string>;
  newestCandidateTimestampMs: number | undefined;
}

export class MailpitRequestError extends Error {
  public override readonly cause: unknown;
  public readonly isTransient: boolean;
  public readonly status: number | undefined;

  public constructor(params: MailpitRequestErrorParams) {
    super(params.message, { cause: params.cause });
    this.name = "MailpitRequestError";
    this.cause = params.cause;
    this.isTransient = params.isTransient ?? false;
    this.status = params.status;
  }
}

class MailpitValueNotFoundError extends Error {}

export function createMailpitClient(params: CreateMailpitClientParams): MailpitClient {
  if (params.password.length === 0) {
    throw new Error("Mailpit password must not be empty");
  }

  const fetchImplementation = params.fetchImplementation ?? fetch;
  const baseUrl = params.baseUrl ?? DEFAULT_MAILPIT_BASE_URL;
  const authorization = `Basic ${Buffer.from(
    `${params.username ?? "cbh"}:${params.password}`,
  ).toString("base64")}`;

  return {
    async searchMessages({ query }) {
      const response = await requestMailpitJson({
        fetchImplementation,
        requestTimeoutMs: params.requestTimeoutMs,
        url: addSearchQuery({ baseUrl, query }),
        authorization,
      });

      if (!isRecord(response) || !Array.isArray(response["messages"])) {
        throw new MailpitRequestError({
          message: "Mailpit search response is malformed",
        });
      }

      return response["messages"].filter(isMailpitMessageSummary);
    },
    async getMessage({ messageId }) {
      const response = await requestMailpitJson({
        fetchImplementation,
        requestTimeoutMs: params.requestTimeoutMs,
        url: new URL(
          `message/${encodeURIComponent(messageId)}`,
          ensureTrailingSlash(baseUrl),
        ).toString(),
        authorization,
      });

      if (!isMailpitMessage(response)) {
        throw new MailpitRequestError({
          message: "Mailpit message response is malformed",
        });
      }

      return response;
    },
  };
}

export async function fetchMailpitValue(
  params: FetchMailpitValueParams,
): Promise<FetchMailpitValueResult> {
  const excludedValues = new Set(params.excludedValues ?? []);
  const valuesByMessageId = new Map<string, string | undefined>();
  const pollingSnapshot = createMailpitPollingSnapshot();
  const nowImplementation = params.nowImplementation ?? Date.now;
  const operationName = `wait for Mailpit ${params.valueLabel}`;
  const retryParams: RunWithRetryParams<FetchMailpitValueResult> = {
    operationName,
    operation: async () => {
      pollingSnapshot.searchAttempts += 1;
      let messages: MailpitMessageSummary[];

      try {
        messages = await params.client.searchMessages({
          query: `to:${params.email}`,
        });
      } catch (error: unknown) {
        if (!isTransientMailpitError({ error })) {
          throw error;
        }

        recordTransientRequestError({ error, pollingSnapshot });
        throw createMailpitValueNotFoundError({
          nowMs: nowImplementation(),
          pollingSnapshot,
          valueLabel: params.valueLabel,
        });
      }

      pollingSnapshot.rawResultCount += messages.length;
      pollingSnapshot.invalidOrMissingTimestampCount += messages.filter(
        (message) => getMailpitMessageTimestampMs({ message }) === undefined,
      ).length;

      const postSentAfterCandidates = messages.filter((message) =>
        isMessageSentAfter({ message, sentAfter: params.sentAfter }),
      );
      pollingSnapshot.postSentAfterCandidateCount += postSentAfterCandidates.length;
      recordNewestCandidateTimestamp({
        candidates: postSentAfterCandidates,
        pollingSnapshot,
      });

      const candidates = postSentAfterCandidates
        .toSorted(compareMailpitMessagesNewestFirst)
        .slice(0, MAX_MESSAGES_TO_FETCH);

      for (const message of candidates) {
        if (valuesByMessageId.has(message.ID)) {
          const cachedValue = valuesByMessageId.get(message.ID);

          if (cachedValue !== undefined && !excludedValues.has(cachedValue)) {
            return createFetchMailpitValueResult({
              message,
              pollingSnapshot,
              value: cachedValue,
            });
          }

          continue;
        }

        try {
          // eslint-disable-next-line no-await-in-loop -- Candidates are checked newest-first.
          const fullMessage = await params.client.getMessage({
            messageId: message.ID,
          });
          pollingSnapshot.fetchedMessageCount += 1;
          const value = params.extractValue({ message: fullMessage });
          valuesByMessageId.set(message.ID, value);

          if (value === undefined) {
            pollingSnapshot.extractionMissCount += 1;
          } else if (excludedValues.has(value)) {
            pollingSnapshot.excludedValueCount += 1;
          } else {
            return createFetchMailpitValueResult({ message, pollingSnapshot, value });
          }
        } catch (error: unknown) {
          if (!isTransientMailpitError({ error })) {
            throw error;
          }

          recordTransientRequestError({ error, pollingSnapshot });
        }
      }

      throw createMailpitValueNotFoundError({
        nowMs: nowImplementation(),
        pollingSnapshot,
        valueLabel: params.valueLabel,
      });
    },
    mode: {
      kind: "poll",
      timeoutMs: params.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      intervalsMs: [params.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS],
      isTransient: ({ error }) =>
        error instanceof MailpitValueNotFoundError || isTransientMailpitError({ error }),
    },
    sleepImplementation: params.sleepImplementation,
    nowImplementation,
  };
  let result: RetrySuccess<FetchMailpitValueResult>;

  try {
    result = await runWithRetry(retryParams);
  } catch (error: unknown) {
    if (
      error instanceof RetryError &&
      error.reason === "timeout" &&
      !(error.cause instanceof MailpitValueNotFoundError)
    ) {
      throw new RetryError({
        operationName,
        attempts: error.attempts,
        elapsedMs: error.elapsedMs,
        reason: error.reason,
        cause: createMailpitValueNotFoundError({
          cause: error.cause,
          nowMs: nowImplementation(),
          pollingSnapshot,
          valueLabel: params.valueLabel,
        }),
      });
    }

    throw error;
  }

  return result.value;
}

export async function fetchMagicLinkFromMailpit(
  params: FetchMagicLinkFromMailpitParams,
): Promise<FetchMailpitValueResult> {
  return await fetchMailpitValue({
    ...params,
    excludedValues: params.excludeLinks,
    extractValue: extractMagicLinkFromMailpitMessage,
    valueLabel: "Cognito magic link",
  });
}

export async function fetchEmailOtpCodeFromMailpit(
  params: FetchEmailOtpCodeFromMailpitParams,
): Promise<FetchMailpitValueResult> {
  return await fetchMailpitValue({
    ...params,
    excludedValues: params.excludeCodes,
    extractValue: extractEmailOtpCodeFromMailpitMessage,
    valueLabel: "Cognito email OTP",
  });
}

export function extractMagicLinkFromMailpitMessage(params: {
  message: MailpitMessage;
}): string | undefined {
  for (const content of [params.message.Text, params.message.HTML]) {
    const match = /https?:\/\/[^\s]+\/v2\/email-login-link\?[^\s<"')]*/i.exec(content);

    if (match !== null) {
      return match[0];
    }
  }

  return undefined;
}

export function extractEmailOtpCodeFromMailpitMessage(params: {
  message: MailpitMessage;
}): string | undefined {
  const textCode = extractEmailOtpCodeFromContent(params.message.Text);
  if (textCode !== undefined) {
    return textCode;
  }

  const htmlText = params.message.HTML.replaceAll(
    /<(style|script)[^>]*>[\s\S]*?<\/\1>/gi,
    "",
  ).replaceAll(/<[^>]+>/g, " ");

  return extractEmailOtpCodeFromContent(htmlText);
}

function extractEmailOtpCodeFromContent(source: string): string | undefined {
  const eightDigits = /(?<!\d)\d{8}(?!\d)/.exec(source);

  if (eightDigits !== null) {
    return eightDigits[0];
  }

  const twoGroups = /(?<!\d)(\d{4})\s*(\d{4})(?!\d)/.exec(source);

  return twoGroups === null ? undefined : `${twoGroups[1]}${twoGroups[2]}`;
}

export function isTransientMailpitError(params: { error: unknown }): boolean {
  if (!(params.error instanceof MailpitRequestError)) {
    return false;
  }

  const { status } = params.error;
  return params.error.isTransient || status === 404 || isRetryableHttpStatus({ status });
}

async function requestMailpitJson(params: {
  fetchImplementation: typeof fetch;
  requestTimeoutMs?: number | undefined;
  url: string;
  authorization: string;
}): Promise<unknown> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, params.requestTimeoutMs ?? 10_000);

  try {
    let response: Response;

    try {
      response = await params.fetchImplementation(params.url, {
        headers: { authorization: params.authorization },
        signal: abortController.signal,
      });
    } catch (error: unknown) {
      throw new MailpitRequestError({
        message: `Mailpit request failed: ${getErrorMessage(error)}`,
        cause: error,
        isTransient: true,
      });
    }

    if (!response.ok) {
      throw new MailpitRequestError({
        message: `Mailpit request failed with HTTP ${response.status}`,
        status: response.status,
      });
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function addSearchQuery(params: { baseUrl: string; query: string }): string {
  const url = new URL("search", ensureTrailingSlash(params.baseUrl));
  url.searchParams.set("query", params.query);

  return url.toString();
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

function isMessageSentAfter(params: {
  message: MailpitMessageSummary;
  sentAfter: Date | undefined;
}): boolean {
  if (params.sentAfter === undefined) {
    return true;
  }

  const messageTimestampMs = getMailpitMessageTimestampMs({ message: params.message });
  if (messageTimestampMs === undefined) {
    // Unparseable timestamps stay eligible so metadata gaps cannot hide a delivered message.
    return true;
  }

  return messageTimestampMs >= params.sentAfter.getTime() - SENT_AFTER_TOLERANCE_MS;
}

function compareMailpitMessagesNewestFirst(
  first: MailpitMessageSummary,
  second: MailpitMessageSummary,
): number {
  const firstTimestamp = getMailpitMessageTimestampMs({ message: first });
  const secondTimestamp = getMailpitMessageTimestampMs({ message: second });

  if (firstTimestamp === undefined) {
    return secondTimestamp === undefined ? 0 : 1;
  }

  if (secondTimestamp === undefined) {
    return -1;
  }

  return secondTimestamp - firstTimestamp;
}

function isMailpitMessage(value: unknown): value is MailpitMessage {
  return (
    isRecord(value) &&
    hasMailpitMessageHeaders(value) &&
    typeof value["Date"] === "string" &&
    typeof value["Text"] === "string" &&
    typeof value["HTML"] === "string"
  );
}

function isMailpitMessageSummary(value: unknown): value is MailpitMessageSummary {
  return (
    isRecord(value) &&
    hasMailpitMessageHeaders(value) &&
    (isNil(value["Created"]) || typeof value["Created"] === "string")
  );
}

function hasMailpitMessageHeaders(value: Record<string, unknown>): boolean {
  return (
    typeof value["ID"] === "string" &&
    typeof value["Subject"] === "string" &&
    isMailpitAddress(value["From"]) &&
    Array.isArray(value["To"]) &&
    value["To"].every(isMailpitAddress)
  );
}

function isMailpitAddress(value: unknown): value is MailpitAddress {
  return (
    isRecord(value) && typeof value["Address"] === "string" && typeof value["Name"] === "string"
  );
}

function createMailpitPollingSnapshot(): MailpitPollingSnapshot {
  return {
    searchAttempts: 0,
    rawResultCount: 0,
    postSentAfterCandidateCount: 0,
    invalidOrMissingTimestampCount: 0,
    fetchedMessageCount: 0,
    extractionMissCount: 0,
    excludedValueCount: 0,
    transientRequestErrorCount: 0,
    transientRequestErrorStatuses: new Set(),
    newestCandidateTimestampMs: undefined,
  };
}

function createFetchMailpitValueResult(params: {
  message: MailpitMessageSummary;
  pollingSnapshot: MailpitPollingSnapshot;
  value: string;
}): FetchMailpitValueResult {
  const messageTimestampMs = getMailpitMessageTimestampMs({ message: params.message });
  const newestCandidateTimestampMs = params.pollingSnapshot.newestCandidateTimestampMs;

  return {
    value: params.value,
    messageId: params.message.ID,
    messageCreatedAt:
      messageTimestampMs === undefined ? undefined : new Date(messageTimestampMs).toISOString(),
    pollingDiagnostics: {
      searchAttempts: params.pollingSnapshot.searchAttempts,
      rawResultCount: params.pollingSnapshot.rawResultCount,
      postSentAfterCandidateCount: params.pollingSnapshot.postSentAfterCandidateCount,
      invalidOrMissingTimestampCount: params.pollingSnapshot.invalidOrMissingTimestampCount,
      fetchedMessageCount: params.pollingSnapshot.fetchedMessageCount,
      extractionMissCount: params.pollingSnapshot.extractionMissCount,
      excludedValueCount: params.pollingSnapshot.excludedValueCount,
      transientRequestErrorCount: params.pollingSnapshot.transientRequestErrorCount,
      transientRequestErrorStatuses: [...params.pollingSnapshot.transientRequestErrorStatuses],
      newestCandidateTimestamp:
        newestCandidateTimestampMs === undefined
          ? undefined
          : new Date(newestCandidateTimestampMs).toISOString(),
    },
  };
}

function createMailpitValueNotFoundError(params: {
  cause?: unknown;
  nowMs: number;
  pollingSnapshot: MailpitPollingSnapshot;
  valueLabel: string;
}): MailpitValueNotFoundError {
  return new MailpitValueNotFoundError(
    `No matching Mailpit ${params.valueLabel} is available yet. ` +
      formatMailpitPollingSnapshot({
        nowMs: params.nowMs,
        pollingSnapshot: params.pollingSnapshot,
      }),
    { cause: params.cause },
  );
}

function formatMailpitPollingSnapshot(params: {
  nowMs: number;
  pollingSnapshot: MailpitPollingSnapshot;
}): string {
  const newestCandidateAgeMs =
    params.pollingSnapshot.newestCandidateTimestampMs === undefined
      ? "unavailable"
      : String(params.nowMs - params.pollingSnapshot.newestCandidateTimestampMs);
  const transientRequestErrorStatuses = [
    ...params.pollingSnapshot.transientRequestErrorStatuses,
  ].join(",");

  return (
    `Polling snapshot: searchAttempts=${params.pollingSnapshot.searchAttempts}, ` +
    `rawResultCount=${params.pollingSnapshot.rawResultCount}, ` +
    `postSentAfterCandidateCount=${params.pollingSnapshot.postSentAfterCandidateCount}, ` +
    `invalidOrMissingTimestampCount=${params.pollingSnapshot.invalidOrMissingTimestampCount}, ` +
    `fetchedMessageCount=${params.pollingSnapshot.fetchedMessageCount}, ` +
    `extractionMissCount=${params.pollingSnapshot.extractionMissCount}, ` +
    `excludedValueCount=${params.pollingSnapshot.excludedValueCount}, ` +
    `transientRequestErrorCount=${params.pollingSnapshot.transientRequestErrorCount}, ` +
    `transientRequestErrorStatuses=[${transientRequestErrorStatuses}], ` +
    `newestCandidateAgeMs=${newestCandidateAgeMs}`
  );
}

function getMailpitMessageTimestampMs(params: {
  message: MailpitMessageSummary;
}): number | undefined {
  if (isNil(params.message.Created)) {
    return undefined;
  }

  const timestampMs = Date.parse(params.message.Created);
  return Number.isFinite(timestampMs) ? timestampMs : undefined;
}

function recordNewestCandidateTimestamp(params: {
  candidates: readonly MailpitMessageSummary[];
  pollingSnapshot: MailpitPollingSnapshot;
}): void {
  const candidateTimestampsMs = params.candidates
    .map((message) => getMailpitMessageTimestampMs({ message }))
    .filter((timestampMs) => timestampMs !== undefined);

  if (candidateTimestampsMs.length === 0) {
    return;
  }

  params.pollingSnapshot.newestCandidateTimestampMs = Math.max(
    params.pollingSnapshot.newestCandidateTimestampMs ?? Number.NEGATIVE_INFINITY,
    ...candidateTimestampsMs,
  );
}

function recordTransientRequestError(params: {
  error: unknown;
  pollingSnapshot: MailpitPollingSnapshot;
}): void {
  params.pollingSnapshot.transientRequestErrorCount += 1;

  if (params.error instanceof MailpitRequestError) {
    params.pollingSnapshot.transientRequestErrorStatuses.add(
      params.error.status?.toString() ?? "unavailable",
    );
  }
}
