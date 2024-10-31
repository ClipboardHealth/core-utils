import { ERROR_CODES, ServiceError, type ServiceErrorParams, type ZodLike } from "./serviceError";

describe("ServiceError", () => {
  describe("fromZodLike", () => {
    it("converts ZodLike to ServiceError", () => {
      const input: ZodLike = {
        name: "ZodError",
        issues: [
          {
            message: "Invalid email format",
            path: ["email"],
          },
          {
            message: "Invalid phone number",
            path: ["phoneNumber"],
          },
        ],
      };

      const actual = ServiceError.fromZodError(input);

      expect(actual).toBeInstanceOf(ServiceError);
      expect(actual.issues).toEqual([
        {
          code: ERROR_CODES.unprocessableEntity,
          message: "Invalid email format",
          path: ["email"],
          title: "Request failed validation",
        },
        {
          code: ERROR_CODES.unprocessableEntity,
          message: "Invalid phone number",
          path: ["phoneNumber"],
          title: "Request failed validation",
        },
      ]);
      expect(actual.cause).toBe(input);
    });
  });

  describe("fromError", () => {
    it("converts Error to ServiceError", () => {
      const input = new Error("Something went wrong");

      const actual = ServiceError.fromUnknown(input);

      expect(actual).toBeInstanceOf(ServiceError);
      expect(actual.issues).toEqual([
        {
          code: ERROR_CODES.internal,
          message: "Something went wrong",
          title: "Internal server error",
        },
      ]);
      expect(actual.cause).toBe(input);
    });

    it("converts non-Error to ServiceError", () => {
      const input = "Something went wrong";

      const actual = ServiceError.fromUnknown(input);

      expect(actual).toBeInstanceOf(ServiceError);
      expect(actual.issues).toEqual([
        {
          code: ERROR_CODES.internal,
          message: "Something went wrong",
          title: "Internal server error",
        },
      ]);
      expect(actual.cause).toBeInstanceOf(Error);
    });

    it("preserves existing ServiceError", () => {
      const input = new ServiceError({
        issues: [
          {
            code: ERROR_CODES.notFound,
            message: "Resource not found",
          },
        ],
      });

      const actual = ServiceError.fromUnknown(input);

      expect(actual).toBe(input);
    });
  });

  it("creates error with single issue", () => {
    const input: ServiceErrorParams = {
      issues: [
        {
          code: ERROR_CODES.notFound,
          message: "User not found",
        },
      ],
    };

    const actual = new ServiceError(input);

    expect(actual.id).toMatch(/^[\da-f-]+$/);
    expect(actual.message).toBe("[notFound]: User not found");
    expect(actual.issues).toHaveLength(1);
    expect(actual.issues[0]).toMatchObject({
      code: ERROR_CODES.notFound,
      message: "User not found",
      title: "Resource not found",
    });
  });

  it("creates error with multiple issues", () => {
    const input: ServiceErrorParams = {
      issues: [
        {
          code: ERROR_CODES.badRequest,
          message: "Invalid email",
          path: ["data", "attributes", "email"],
        },
        {
          code: ERROR_CODES.badRequest,
          message: "Invalid phone",
          path: ["data", "attributes", "phoneNumber"],
        },
      ],
    };

    const actual = new ServiceError(input);

    expect(actual.message).toBe("[badRequest]: Invalid email; [badRequest]: Invalid phone");
    expect(actual.issues).toHaveLength(2);
    expect(actual.issues).toEqual([
      {
        code: ERROR_CODES.badRequest,
        message: "Invalid email",
        path: ["data", "attributes", "email"],
        title: "Invalid or malformed request",
      },
      {
        code: ERROR_CODES.badRequest,
        message: "Invalid phone",
        path: ["data", "attributes", "phoneNumber"],
        title: "Invalid or malformed request",
      },
    ]);
  });

  it("converts to string", () => {
    const input = {
      issues: [{ code: ERROR_CODES.notFound }],
      cause: new Error("Not in database"),
    };

    const actual = new ServiceError(input);

    expect(actual.toString()).toMatch(/^ServiceError\[[\da-f-]+]: \[notFound]$/);
  });

  it("converts to JSON:API format with all fields", () => {
    const input = {
      issues: [
        {
          code: ERROR_CODES.badRequest,
          message: "Invalid email format",
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
      title: "Invalid or malformed request",
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

  it("converts multiple issues to JSON:API format", () => {
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

    const jsonApi = actual.toJsonApi();
    expect(jsonApi.errors).toHaveLength(2);
    expect(jsonApi.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "400",
          source: expect.objectContaining({
            pointer: expect.stringMatching(/^\//),
          }),
        }),
      ]),
    );
  });

  it("creates error with default message when issues array is empty", () => {
    const input = {
      issues: [],
    };

    const actual = new ServiceError(input);

    expect(actual.message).toBe("[unknown]");
    expect(actual.issues).toHaveLength(0);
  });

  it("creates error from string message", () => {
    const actual = new ServiceError("Something went wrong");

    expect(actual.message).toBe("[internal]: Something went wrong");
    expect(actual.issues).toHaveLength(1);
    expect(actual.issues[0]).toMatchObject({
      code: ERROR_CODES.internal,
      message: "Something went wrong",
      title: "Internal server error",
    });
  });
});
