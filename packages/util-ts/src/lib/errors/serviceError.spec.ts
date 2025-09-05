import { ok } from "node:assert/strict";

import { ZodError } from "zod";

import { ERROR_CODES, ServiceError, type ServiceErrorParams } from "./serviceError";

describe("ServiceError", () => {
  describe("fromZodLike", () => {
    it("converts ZodLike to ServiceError", () => {
      const input = new ZodError([
        {
          code: "invalid_type",
          message: "Invalid email format",
          path: ["email"],
          expected: "string",
          received: "number",
        },
        {
          code: "invalid_type",
          message: "Invalid phone number",
          path: ["phoneNumber"],
          expected: "string",
          received: "number",
        },
      ]);

      const actual = ServiceError.fromZodError(input);

      expect(actual).toBeInstanceOf(ServiceError);
      expect(actual.issues).toEqual([
        {
          code: ERROR_CODES.badRequest,
          message: "Invalid email format",
          path: ["email"],
          title: "Invalid or malformed request",
        },
        {
          code: ERROR_CODES.badRequest,
          message: "Invalid phone number",
          path: ["phoneNumber"],
          title: "Invalid or malformed request",
        },
      ]);
      expect(actual.cause).toBe(input);
      expect(actual.status).toBe(400);
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
      expect(actual.status).toBe(500);
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
      expect(actual.status).toBe(500);
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
      expect(actual.status).toBe(404);
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
    expect(actual.status).toBe(404);
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
    expect(actual.status).toBe(400);
  });

  it("converts to string", () => {
    const input = {
      issues: [{ code: ERROR_CODES.notFound }],
      cause: new Error("Not in database"),
    };

    const actual = new ServiceError(input);

    expect(actual.toString()).toMatch(/^ServiceError\[[\da-f-]+]: \[notFound]$/);
    expect(actual.status).toBe(404);
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
          code: ERROR_CODES.unprocessableEntity,
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
          status: "422",
          source: expect.objectContaining({
            pointer: expect.stringMatching(/^\//),
          }),
        }),
      ]),
    );
    expect(actual.status).toBe(422);
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
    expect(actual.status).toBe(500);
  });

  it("creates with custom code", () => {
    const input = {
      issues: [
        {
          code: "licenseNotFound",
        },
      ],
    };

    const actual = new ServiceError(input);
    const jsonApi = actual.toJsonApi();

    expect(jsonApi.errors[0]).toEqual({
      id: actual.id,
      status: "500",
      code: "licenseNotFound",
    });
  });

  it("creates with custom code, status, and message", () => {
    const input = {
      issues: [
        {
          code: "licenseNotFound",
          status: 422,
          message: "CNA license is required to book a shift",
        } as const,
      ],
    };

    const actual = new ServiceError(input);
    const jsonApi = actual.toJsonApi();

    expect(jsonApi.errors[0]).toEqual({
      id: actual.id,
      status: "422",
      code: "licenseNotFound",
      detail: "CNA license is required to book a shift",
    });
  });

  describe("source handling", () => {
    it("uses pointer as default source", () => {
      const input = {
        issues: [
          {
            code: ERROR_CODES.badRequest,
            message: "Invalid value",
            path: ["data", "attributes", "email"],
          },
        ],
      };

      const actual = new ServiceError(input);
      const jsonApi = actual.toJsonApi();

      ok(jsonApi.errors[0]);
      expect(jsonApi.errors[0].source).toEqual({
        pointer: "/data/attributes/email",
      });
    });

    it("uses specified source in constructor", () => {
      const input = {
        issues: [
          {
            code: ERROR_CODES.badRequest,
            message: "Invalid header",
            path: ["authorization"],
          },
        ],
        source: "header" as const,
      };

      const actual = new ServiceError(input);
      const jsonApi = actual.toJsonApi();

      ok(jsonApi.errors[0]);
      expect(jsonApi.errors[0].source).toEqual({
        header: "/authorization",
      });
    });

    it("uses specified source in fromZodError", () => {
      const zodError = new ZodError([
        {
          code: "invalid_type",
          message: "Invalid parameter",
          path: ["page"],
          expected: "number",
          received: "string",
        },
      ]);

      const actual = ServiceError.fromZodError(zodError, { source: "header" });
      const jsonApi = actual.toJsonApi();

      ok(jsonApi.errors[0]);
      expect(jsonApi.errors[0].source).toEqual({
        header: "/page",
      });
    });
  });

  describe("status code handling", () => {
    it("uses highest status code when multiple issues exist", () => {
      const input = {
        issues: [
          { code: ERROR_CODES.badRequest }, // 400
          { code: ERROR_CODES.unprocessableEntity }, // 422
          { code: ERROR_CODES.notFound }, // 404
        ],
      };

      const actual = new ServiceError(input);

      expect(actual.status).toBe(422);
    });
  });

  describe("fromJsonApi", () => {
    it("converts JSON:API error with all fields", () => {
      const input = {
        errors: [
          {
            id: "123",
            status: "400",
            code: ERROR_CODES.badRequest,
            title: "Invalid request",
            detail: "Invalid email format",
            source: {
              pointer: "/data/attributes/email",
            },
          } as const,
        ],
      };

      const actual = ServiceError.fromJsonApi(input);

      expect(actual).toBeInstanceOf(ServiceError);
      expect(actual.id).toBe("123");
      expect(actual.issues).toEqual([
        {
          code: ERROR_CODES.badRequest,
          message: "Invalid email format",
          path: ["data", "attributes", "email"],
          status: 400,
          title: "Invalid request",
        },
      ]);
      expect(actual.status).toBe(400);
    });

    it("converts JSON:API error with minimal fields", () => {
      const input = {
        errors: [
          {
            code: ERROR_CODES.notFound,
          },
        ],
      };

      const actual = ServiceError.fromJsonApi(input);

      expect(actual).toBeInstanceOf(ServiceError);
      expect(actual.issues).toEqual([
        {
          code: ERROR_CODES.notFound,
          title: "Resource not found",
        },
      ]);
      expect(actual.status).toBe(404);
    });

    it("converts multiple JSON:API errors", () => {
      const input = {
        errors: [
          {
            code: ERROR_CODES.badRequest,
            detail: "Invalid email",
            source: {
              pointer: "/data/attributes/email",
            },
          },
          {
            code: ERROR_CODES.unprocessableEntity,
            detail: "Invalid phone",
            source: {
              pointer: "/data/attributes/phone",
            },
          },
        ],
      };

      const actual = ServiceError.fromJsonApi(input);

      expect(actual).toBeInstanceOf(ServiceError);
      expect(actual.issues).toEqual([
        {
          code: ERROR_CODES.badRequest,
          message: "Invalid email",
          path: ["data", "attributes", "email"],
          title: "Invalid or malformed request",
        },
        {
          code: ERROR_CODES.unprocessableEntity,
          message: "Invalid phone",
          path: ["data", "attributes", "phone"],
          title: "Request failed validation",
        },
      ]);
      expect(actual.status).toBe(422);
    });

    it("handles different source types", () => {
      const input = {
        errors: [
          {
            code: ERROR_CODES.badRequest,
            detail: "Invalid header",
            source: {
              header: "/authorization",
            },
          },
        ],
      };

      const actual = ServiceError.fromJsonApi(input);

      expect(actual).toBeInstanceOf(ServiceError);
      expect(actual.issues).toEqual([
        {
          code: ERROR_CODES.badRequest,
          message: "Invalid header",
          path: ["authorization"],
          title: "Invalid or malformed request",
        },
      ]);
    });

    it("handles empty source object", () => {
      const input = {
        errors: [
          {
            code: ERROR_CODES.badRequest,
            detail: "Invalid request",
            source: {},
          },
        ],
      };

      const actual = ServiceError.fromJsonApi(input);

      expect(actual).toBeInstanceOf(ServiceError);
      expect(actual.issues).toEqual([
        {
          code: ERROR_CODES.badRequest,
          message: "Invalid request",
          title: "Invalid or malformed request",
        },
      ]);
    });

    it("handles missing source field", () => {
      const input = {
        errors: [
          {
            code: ERROR_CODES.badRequest,
            detail: "Invalid request",
          },
        ],
      };

      const actual = ServiceError.fromJsonApi(input);

      expect(actual).toBeInstanceOf(ServiceError);
      expect(actual.issues).toEqual([
        {
          code: ERROR_CODES.badRequest,
          message: "Invalid request",
          title: "Invalid or malformed request",
        },
      ]);
    });

    it("handles empty path in source", () => {
      const input = {
        errors: [
          {
            code: ERROR_CODES.badRequest,
            detail: "Invalid request",
            source: {
              pointer: "/",
            },
          },
        ],
      };

      const actual = ServiceError.fromJsonApi(input);

      expect(actual).toBeInstanceOf(ServiceError);
      expect(actual.issues).toEqual([
        {
          code: ERROR_CODES.badRequest,
          message: "Invalid request",
          title: "Invalid or malformed request",
        },
      ]);
    });

    it("uses default error code when none provided", () => {
      const input = {
        errors: [
          {
            detail: "Something went wrong",
          },
        ],
      };

      const actual = ServiceError.fromJsonApi(input);

      expect(actual).toBeInstanceOf(ServiceError);
      expect(actual.issues).toEqual([
        {
          code: ERROR_CODES.internal,
          message: "Something went wrong",
          title: "Internal server error",
        },
      ]);
      expect(actual.status).toBe(500);
    });

    it("converts to JSON:API error with custom code", () => {
      const input = {
        errors: [
          {
            code: "licenseNotFound",
          },
        ],
      };

      const actual = ServiceError.fromJsonApi(input);

      expect(actual).toBeInstanceOf(ServiceError);
      expect(actual.issues).toEqual([
        {
          code: "licenseNotFound",
        },
      ]);
      expect(actual.status).toBe(500);
    });

    it("converts to JSON:API error with custom code, status, title, and detail", () => {
      const input = {
        errors: [
          {
            code: "licenseNotFound",
            status: "422",
            title: "The license is not found",
            detail: "CNA license is required when booking a placement",
          } as const,
        ],
      };

      const actual = ServiceError.fromJsonApi(input);

      expect(actual).toBeInstanceOf(ServiceError);
      expect(actual.issues).toEqual([
        {
          code: "licenseNotFound",
          status: 422,
          title: "The license is not found",
          message: "CNA license is required when booking a placement",
        },
      ]);
      expect(actual.status).toBe(422);
    });
  });

  describe("merge", () => {
    it("returns same error when merging single error", () => {
      const error = new ServiceError({
        issues: [{ code: ERROR_CODES.notFound, message: "Not found" }],
      });

      const result = ServiceError.merge(error);

      expect(result).toBe(error);
    });

    it("merges two errors", () => {
      const error1 = new ServiceError({
        issues: [{ code: ERROR_CODES.badRequest, message: "Invalid input" }],
      });
      const error2 = new ServiceError({
        issues: [{ code: ERROR_CODES.notFound, message: "Resource not found" }],
      });

      const result = ServiceError.merge(error1, error2);

      expect(result.issues).toHaveLength(2);
      expect(result.issues).toEqual([
        {
          code: ERROR_CODES.badRequest,
          message: "Invalid input",
          title: "Invalid or malformed request",
        },
        {
          code: ERROR_CODES.notFound,
          message: "Resource not found",
          title: "Resource not found",
        },
      ]);
      expect(result.cause).toBe(error1);
    });

    it("uses highest status code when merging multiple errors", () => {
      const error1 = new ServiceError({
        issues: [{ code: ERROR_CODES.badRequest }], // 400
      });
      const error2 = new ServiceError({
        issues: [{ code: ERROR_CODES.unprocessableEntity }], // 422
      });
      const error3 = new ServiceError({
        issues: [{ code: ERROR_CODES.notFound }], // 404
      });

      const result = ServiceError.merge(error1, error2, error3);

      expect(result.status).toBe(422);
    });

    it("generates new ID for merged error", () => {
      const error1 = new ServiceError({
        issues: [{ code: ERROR_CODES.badRequest }],
      });
      const error2 = new ServiceError({
        issues: [{ code: ERROR_CODES.notFound }],
      });

      const result = ServiceError.merge(error1, error2);

      expect(result.id).not.toBe(error1.id);
      expect(result.id).not.toBe(error2.id);
      expect(result.id).toMatch(/^[\da-f-]+$/);
    });
  });
});
