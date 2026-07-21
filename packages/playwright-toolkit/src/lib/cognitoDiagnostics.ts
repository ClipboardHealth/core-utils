import { isRecord, toErrorMessage as getErrorMessage } from "@clipboard-health/util-ts";
import type { Page, Request, Response, TestInfo } from "@playwright/test";

const COGNITO_HOST_PATTERN = /^cognito-idp\.[^.]+\.amazonaws\.com$/;
const RESPOND_TO_AUTH_CHALLENGE_TARGET = "AWSCognitoIdentityProviderService.RespondToAuthChallenge";
const OTP_CHALLENGE_NAMES = new Set(["EMAIL_OTP", "SMS_OTP"]);
const DEFAULT_REDIRECT_TIMEOUT_MS = 30_000;
const DIAGNOSTIC_SAMPLE_MAX_LENGTH = 700;
const SCREENSHOT_ATTACHMENT_NAME = "cognito-otp-diagnostics";

type ExpectedUrl = Parameters<Page["waitForURL"]>[0];

export interface CognitoRequestLike {
  headers(): Record<string, string>;
  method(): string;
  postDataJSON(): unknown;
  url(): string;
}

export interface CognitoRequestSummary {
  action: string;
  challengeName: string;
  method: string;
  target: string;
  url: string;
}

export interface FillOtpAndWaitForCognitoRedirectParams {
  expectedUrl: ExpectedUrl;
  otp: string;
  page: Page;
  testInfo?: TestInfo | undefined;
  expectedUrlTimeoutMs?: number | undefined;
  inputLabel?: string | RegExp | undefined;
}

type CognitoChallengeAttempt =
  | {
      request: CognitoRequestSummary;
      responseBodySample: string;
      status: number;
      statusText: string;
      type: "response";
    }
  | {
      failureText: string;
      request: CognitoRequestSummary;
      type: "request-failure";
    }
  | {
      timeoutMs: number;
      type: "not-observed";
    };

interface CognitoChallengeMonitor {
  result: Promise<CognitoChallengeAttempt>;
  dispose(): void;
}

/**
 * Fills an OTP and waits for the login redirect. On failure it reports the
 * observed Cognito challenge, sanitized response/page text, current URL, and
 * an optional redacted screenshot attachment.
 */
export async function fillOtpAndWaitForCognitoRedirect(
  params: FillOtpAndWaitForCognitoRedirectParams,
): Promise<{ redirectUrl: string }> {
  const timeoutMs = params.expectedUrlTimeoutMs ?? DEFAULT_REDIRECT_TIMEOUT_MS;
  const monitor = createCognitoChallengeMonitor({
    page: params.page,
    timeoutMs,
  });

  try {
    await params.page
      .getByLabel(params.inputLabel ?? "Verification Code", { exact: true })
      .fill(params.otp);
  } catch (error: unknown) {
    monitor.dispose();
    throw error;
  }

  try {
    await params.page.waitForURL(params.expectedUrl, { timeout: timeoutMs });
    monitor.dispose();
    return { redirectUrl: params.page.url() };
  } catch (error: unknown) {
    const diagnostics = await getFailureDiagnostics({
      attemptPromise: monitor.result,
      page: params.page,
      testInfo: params.testInfo,
    });
    const finalErrorMessage = sanitizeCognitoDiagnosticText({
      text: getErrorMessage(error),
    });

    // oxlint-disable-next-line preserve-caught-error -- Raw Playwright errors may contain OTPs or account PII.
    throw new Error(
      `Post-OTP redirect did not reach ${formatExpectedUrl(params.expectedUrl)} ` +
        `within ${timeoutMs}ms. ${diagnostics} Last error: ${finalErrorMessage}`,
      { cause: new Error(finalErrorMessage) },
    );
  }
}

export function isCognitoOtpChallengeRequest(params: { request: CognitoRequestLike }): boolean {
  const { request } = params;

  if (request.method() !== "POST" || !isCognitoIdpUrl({ rawUrl: request.url() })) {
    return false;
  }

  if (request.headers()["x-amz-target"] !== RESPOND_TO_AUTH_CHALLENGE_TARGET) {
    return false;
  }

  const challengeName = getStringProperty({
    value: getRequestPostDataJson({ request }),
    propertyName: "ChallengeName",
  });

  return challengeName !== undefined && OTP_CHALLENGE_NAMES.has(challengeName);
}

export function summarizeCognitoAuthRequest(params: {
  request: CognitoRequestLike;
}): CognitoRequestSummary {
  const target = params.request.headers()["x-amz-target"] ?? "unknown";
  const targetParts = target.split(".");
  const postData = getRequestPostDataJson({ request: params.request });

  return {
    action: targetParts.at(-1) ?? target,
    challengeName:
      getStringProperty({ value: postData, propertyName: "ChallengeName" }) ?? "unknown",
    method: params.request.method(),
    target,
    url: sanitizeUrl({ rawUrl: params.request.url() }),
  };
}

export function sanitizeCognitoDiagnosticText(params: { text: string }): string {
  return params.text
    .replaceAll(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted-token]")
    .replaceAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted-jwt]")
    .replaceAll(
      /("(?:[^"]*(?:authorization|challengeResponse|code|email|password|phone|session|token)[^"]*)"\s*:\s*)"[^"]*"/gi,
      '$1"[redacted]"',
    )
    .replaceAll(
      /\b(?:authorization|challengeResponse|code|email|password|phone|session|token)=\S+/gi,
      (match) => match.replace(/[=].*/, "=[redacted]"),
    )
    .replaceAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replaceAll(/\+?\d[\d\s().-]{5,}\d/g, "[redacted-number]")
    .replaceAll(/\b\d{4,}\b/g, "[redacted-number]");
}

function createCognitoChallengeMonitor(params: {
  page: Page;
  timeoutMs: number;
}): CognitoChallengeMonitor {
  let complete: ((attempt: CognitoChallengeAttempt) => void) | undefined;

  const result = new Promise<CognitoChallengeAttempt>((resolve) => {
    let isComplete = false;
    const timeout = setTimeout(() => {
      completeAttempt({ timeoutMs: params.timeoutMs, type: "not-observed" });
    }, params.timeoutMs);

    function completeAttempt(attempt: CognitoChallengeAttempt): void {
      if (isComplete) {
        return;
      }

      isComplete = true;
      clearTimeout(timeout);
      params.page.off("response", handleResponse);
      params.page.off("requestfailed", handleRequestFailure);
      resolve(attempt);
    }

    complete = completeAttempt;

    async function handleResponse(response: Response): Promise<void> {
      if (!isCognitoOtpChallengeRequest({ request: response.request() })) {
        return;
      }

      try {
        completeAttempt(await buildResponseAttempt({ response }));
      } catch (error: unknown) {
        completeAttempt({
          request: summarizeCognitoAuthRequest({ request: response.request() }),
          responseBodySample: `unavailable: ${sanitizeCognitoDiagnosticText({
            text: getErrorMessage(error),
          })}`,
          status: response.status(),
          statusText: response.statusText(),
          type: "response",
        });
      }
    }

    function handleRequestFailure(request: Request): void {
      if (!isCognitoOtpChallengeRequest({ request })) {
        return;
      }

      completeAttempt({
        failureText: sanitizeCognitoDiagnosticText({
          text: request.failure()?.errorText ?? "unknown request failure",
        }),
        request: summarizeCognitoAuthRequest({ request }),
        type: "request-failure",
      });
    }

    params.page.on("response", handleResponse);
    params.page.on("requestfailed", handleRequestFailure);
  });

  return {
    result,
    dispose() {
      complete?.({ timeoutMs: params.timeoutMs, type: "not-observed" });
    },
  };
}

async function buildResponseAttempt(params: {
  response: Response;
}): Promise<CognitoChallengeAttempt> {
  return {
    request: summarizeCognitoAuthRequest({
      request: params.response.request(),
    }),
    responseBodySample: await getResponseBodySample({
      response: params.response,
    }),
    status: params.response.status(),
    statusText: params.response.statusText(),
    type: "response",
  };
}

async function getFailureDiagnostics(params: {
  attemptPromise: Promise<CognitoChallengeAttempt>;
  page: Page;
  testInfo: TestInfo | undefined;
}): Promise<string> {
  const [attempt, pageTextSample, screenshotStatus] = await Promise.all([
    params.attemptPromise,
    getVisiblePageTextSample({ page: params.page }),
    attachSanitizedScreenshot({ page: params.page, testInfo: params.testInfo }),
  ]);

  return [
    `Cognito OTP challenge: ${formatAttempt(attempt)}.`,
    `Current URL: ${sanitizeUrl({ rawUrl: params.page.url() })}.`,
    `Visible page text sample: "${pageTextSample}".`,
    `Screenshot: ${screenshotStatus}.`,
  ].join(" ");
}

function formatAttempt(attempt: CognitoChallengeAttempt): string {
  if (attempt.type === "not-observed") {
    return `not observed within ${attempt.timeoutMs}ms`;
  }

  const request = [
    `method=${attempt.request.method}`,
    `url=${attempt.request.url}`,
    `target=${attempt.request.target}`,
    `action=${attempt.request.action}`,
    `challengeName=${attempt.request.challengeName}`,
  ].join("; ");

  if (attempt.type === "request-failure") {
    return `${request}; failureText="${attempt.failureText}"`;
  }

  const status =
    attempt.statusText.length === 0
      ? `${attempt.status}`
      : `${attempt.status} ${attempt.statusText}`;

  return `${request}; status=${status}; responseBodySample="${attempt.responseBodySample}"`;
}

async function getResponseBodySample(params: { response: Response }): Promise<string> {
  if (params.response.status() >= 200 && params.response.status() < 400) {
    return "omitted because successful Cognito responses can include tokens";
  }

  try {
    return truncateDiagnosticText({
      text: sanitizeCognitoDiagnosticText({
        text: await params.response.text(),
      }),
    });
  } catch (error: unknown) {
    return `unavailable: ${sanitizeCognitoDiagnosticText({ text: getErrorMessage(error) })}`;
  }
}

async function getVisiblePageTextSample(params: { page: Page }): Promise<string> {
  try {
    const bodyText = (await params.page.locator("body").textContent({ timeout: 1000 })) ?? "";
    return truncateDiagnosticText({
      text: sanitizeCognitoDiagnosticText({ text: bodyText }),
    });
  } catch (error: unknown) {
    return `unavailable: ${sanitizeCognitoDiagnosticText({ text: getErrorMessage(error) })}`;
  }
}

async function attachSanitizedScreenshot(params: {
  page: Page;
  testInfo: TestInfo | undefined;
}): Promise<string> {
  if (params.testInfo === undefined) {
    return "not attached; testInfo unavailable";
  }

  try {
    await redactPageForScreenshot({ page: params.page });
    const screenshot = await params.page.screenshot({ fullPage: true });
    await params.testInfo.attach(SCREENSHOT_ATTACHMENT_NAME, {
      body: screenshot,
      contentType: "image/png",
    });
    return `attached as ${SCREENSHOT_ATTACHMENT_NAME}`;
  } catch (error: unknown) {
    return `unavailable: ${sanitizeCognitoDiagnosticText({ text: getErrorMessage(error) })}`;
  }
}

async function redactPageForScreenshot(params: { page: Page }): Promise<void> {
  await params.page.evaluate(() => {
    // eslint-disable-next-line unicorn/consistent-function-scoping -- Serialized into the browser context.
    function redact(value: string): string {
      return value
        .replaceAll(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted-token]")
        .replaceAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted-jwt]")
        .replaceAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
        .replaceAll(/\+?\d[\d\s().-]{5,}\d/g, "[redacted-number]")
        .replaceAll(/\b\d{4,}\b/g, "[redacted-number]");
    }

    if (document.body === null) {
      return;
    }

    const treeWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let currentNode = treeWalker.nextNode();

    while (currentNode !== null) {
      const originalText = currentNode.textContent ?? "";
      const redactedText = redact(originalText);

      if (redactedText !== originalText) {
        currentNode.textContent = redactedText;
      }

      currentNode = treeWalker.nextNode();
    }

    const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "input, textarea",
    );

    for (const field of fields) {
      const redactedValue = redact(field.value);
      if (redactedValue !== field.value) {
        field.value = redactedValue;
      }

      const valueAttribute = field.getAttribute("value");
      if (valueAttribute !== null) {
        const redactedValueAttribute = redact(valueAttribute);

        if (redactedValueAttribute !== valueAttribute) {
          field.setAttribute("value", redactedValueAttribute);
        }
      }
    }
  });
}

function getRequestPostDataJson(params: { request: CognitoRequestLike }): unknown {
  try {
    return params.request.postDataJSON();
  } catch {
    return undefined;
  }
}

function getStringProperty(params: { value: unknown; propertyName: string }): string | undefined {
  if (!isRecord(params.value)) {
    return undefined;
  }

  const propertyValue = params.value[params.propertyName];
  return typeof propertyValue === "string" ? propertyValue : undefined;
}

function isCognitoIdpUrl(params: { rawUrl: string }): boolean {
  try {
    return COGNITO_HOST_PATTERN.test(new URL(params.rawUrl).hostname);
  } catch {
    return false;
  }
}

function sanitizeUrl(params: { rawUrl: string }): string {
  try {
    const url = new URL(params.rawUrl);
    return [
      url.origin,
      url.pathname === "/" ? "/" : "/[redacted-path]",
      url.search.length === 0 ? "" : "?[redacted-query]",
      url.hash.length === 0 ? "" : "#[redacted-hash]",
    ].join("");
  } catch {
    return truncateDiagnosticText({
      text: sanitizeCognitoDiagnosticText({ text: params.rawUrl }),
    });
  }
}

function formatExpectedUrl(expectedUrl: ExpectedUrl): string {
  if (typeof expectedUrl === "string") {
    return sanitizeUrl({ rawUrl: expectedUrl });
  }

  if (expectedUrl instanceof RegExp) {
    return sanitizeCognitoDiagnosticText({ text: expectedUrl.toString() });
  }

  return "[URL predicate]";
}

function truncateDiagnosticText(params: { text: string }): string {
  const normalizedText = params.text.replaceAll(/\s+/g, " ").trim();

  return normalizedText.length <= DIAGNOSTIC_SAMPLE_MAX_LENGTH
    ? normalizedText
    : `${normalizedText.slice(0, DIAGNOSTIC_SAMPLE_MAX_LENGTH)}...`;
}
