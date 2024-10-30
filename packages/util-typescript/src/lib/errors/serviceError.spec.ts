import { ERROR_CODES, ServiceError } from "./serviceError";

describe("ServiceError", () => {
  it("creates error with single issue", () => {
    const input = {
      issues: [
        {
          code: ERROR_CODES.notFound,
          detail: "User not found",
        },
      ],
    };

    const actual = new ServiceError(input);

    expect(actual.id).toBeDefined();
    expect(actual.message).toBe("[notFound]: User not found");
    expect(actual.issues).toHaveLength(1);
    expect(actual.issues[0]).toMatchObject({
      code: ERROR_CODES.notFound,
      detail: "User not found",
      title: "Resource not found",
    });
  });

  it("creates error with multiple issues", () => {
    const input = {
      issues: [
        {
          code: ERROR_CODES.badRequest,
          detail: "Invalid email",
          path: ["data", "attributes", "email"],
        },
        {
          code: ERROR_CODES.badRequest,
          detail: "Invalid phone",
          path: ["data", "attributes", "phone"],
        },
      ],
    };

    const actual = new ServiceError(input);

    expect(actual.message).toBe("[badRequest]: Invalid email; [badRequest]: Invalid phone");
    expect(actual.issues).toHaveLength(2);
  });

  it("converts to string with cause", () => {
    const input = {
      issues: [{ code: ERROR_CODES.notFound }],
      cause: new Error("Not in database"),
    };

    const actual = new ServiceError(input);

    expect(actual.toString()).toMatch(
      /^ServiceError\[[\da-f-]+]: \[notFound]; \[cause]: Error: Not in database$/,
    );
  });

  it("converts to string without cause", () => {
    const input = {
      issues: [{ code: ERROR_CODES.notFound }],
    };

    const actual = new ServiceError(input);

    expect(actual.toString()).toMatch(/^ServiceError\[[\da-f-]+]: \[notFound]$/);
  });

  it("converts to JSON:API format with all fields", () => {
    const input = {
      issues: [
        {
          code: ERROR_CODES.badRequest,
          title: "Custom title",
          detail: "Invalid email format",
          path: ["data", "attributes", "email"],
        },
      ],
    };

    const actual = new ServiceError(input);
    const jsonApi = actual.toJsonApi();

    expect(jsonApi.errors[0]).toEqual({
      id: actual.id,
      status: "400",
      code: ERROR_CODES.badRequest,
      title: "Custom title",
      detail: "Invalid email format",
      source: {
        pointer: "/data/attributes/email",
      },
    });
  });

  it("converts to JSON:API format with minimal fields", () => {
    const input = {
      issues: [
        {
          code: ERROR_CODES.notFound,
        },
      ],
    };

    const actual = new ServiceError(input);
    const jsonApi = actual.toJsonApi();

    expect(jsonApi.errors[0]).toEqual({
      id: actual.id,
      status: "404",
      code: ERROR_CODES.notFound,
      title: "Resource not found",
    });
  });
});
