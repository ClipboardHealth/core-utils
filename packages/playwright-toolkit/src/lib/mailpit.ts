import { isRecord, toErrorMessage as getErrorMessage } from "@clipboard-health/util-ts";

import { runWithRetry } from "./retry";
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
  Created: string;
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

export interface FetchMailpitValueResult {
  value: string;
  messageId: string;
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
  const result = await runWithRetry({
    operationName: `wait for Mailpit ${params.valueLabel}`,
    operation: async () => {
      const messages = await params.client.searchMessages({
        query: `to:${params.email}`,
      });
      const candidates = messages
        .filter((message) => isMessageSentAfter({ message, sentAfter: params.sentAfter }))
        .toSorted(compareMailpitMessagesNewestFirst)
        .slice(0, MAX_MESSAGES_TO_FETCH);

      for (const message of candidates) {
        if (valuesByMessageId.has(message.ID)) {
          const cachedValue = valuesByMessageId.get(message.ID);

          if (cachedValue !== undefined && !excludedValues.has(cachedValue)) {
            return { value: cachedValue, messageId: message.ID };
          }

          continue;
        }

        try {
          // eslint-disable-next-line no-await-in-loop -- Candidates are checked newest-first.
          const fullMessage = await params.client.getMessage({
            messageId: message.ID,
          });
          const value = params.extractValue({ message: fullMessage });
          valuesByMessageId.set(message.ID, value);

          if (value !== undefined && !excludedValues.has(value)) {
            return { value, messageId: message.ID };
          }
        } catch (error: unknown) {
          if (!isTransientMailpitError({ error })) {
            throw error;
          }
        }
      }

      throw new MailpitValueNotFoundError(
        `No matching Mailpit ${params.valueLabel} is available yet`,
      );
    },
    mode: {
      kind: "poll",
      timeoutMs: params.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      intervalsMs: [params.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS],
      isTransient: ({ error }) =>
        error instanceof MailpitValueNotFoundError || isTransientMailpitError({ error }),
    },
    sleepImplementation: params.sleepImplementation,
    nowImplementation: params.nowImplementation,
  });

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

  const messageTimestamp = Date.parse(params.message.Created);
  if (!Number.isFinite(messageTimestamp)) {
    return true;
  }

  return messageTimestamp >= params.sentAfter.getTime() - SENT_AFTER_TOLERANCE_MS;
}

function compareMailpitMessagesNewestFirst(
  first: MailpitMessageSummary,
  second: MailpitMessageSummary,
): number {
  const firstTimestamp = Date.parse(first.Created);
  const secondTimestamp = Date.parse(second.Created);

  if (!Number.isFinite(firstTimestamp)) {
    return Number.isFinite(secondTimestamp) ? 1 : 0;
  }

  if (!Number.isFinite(secondTimestamp)) {
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
  return isRecord(value) && hasMailpitMessageHeaders(value) && typeof value["Created"] === "string";
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
