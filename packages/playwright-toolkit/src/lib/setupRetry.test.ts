import { classifySetupRetry, isRetryableHttpStatus } from "../index";

describe("setup retry classification", () => {
  it.each([408, 429, 500, 503])("classifies HTTP %s as transient", (status) => {
    expect(isRetryableHttpStatus({ status })).toBe(true);
  });

  it.each([400, 401, 403, 404, 422, 600])("classifies HTTP %s as deterministic", (status) => {
    expect(isRetryableHttpStatus({ status })).toBe(false);
  });

  it("regenerates identity for collision failures", () => {
    const input = new Error("phone already in use");

    expect(
      classifySetupRetry({
        error: input,
        isIdentityCollision: ({ error }) => error === input,
      }),
    ).toEqual({
      classification: "identity-collision",
      retryDecision: "regenerate-identity",
    });
  });

  it("retries the same identity only for transient failures", () => {
    const input = {
      message: "service unavailable",
      response: { status: 503 },
    };

    expect(classifySetupRetry({ error: input })).toEqual({
      classification: "transient",
      retryDecision: "retry-same-identity",
    });
  });

  it("does not retry deterministic setup failures", () => {
    const input = {
      message: "invalid qualification",
      response: { status: 422 },
    };

    expect(classifySetupRetry({ error: input })).toEqual({
      classification: "deterministic",
      retryDecision: "do-not-retry",
    });
  });
});
