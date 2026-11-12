import {
  expectToBeSafeParseError,
  expectToBeSafeParseSuccess,
} from "@clipboard-health/testing-core";
import { expectTypeOf } from "vitest";
import { z } from "zod";

import { type ApiError, apiError, apiErrors, apiErrorSource, apiErrorsWith } from "./apiError";

describe("apiErrors.safeParse", () => {
  it.each<{ input: { errors: ApiError[] }; name: string }>([
    {
      name: "parses empty errors array",
      input: { errors: [] },
    },
    {
      name: "parses valid single error",
      input: {
        errors: [
          {
            code: "InvalidArgument",
            id: "123e4567-e89b-12d3-a456-426614174000",
            status: "400",
            title: "Bad Request",
          },
        ],
      },
    },
    {
      name: "parses valid multiple errors",
      input: {
        errors: [
          {
            code: "InvalidArgument",
            id: "123e4567-e89b-12d3-a456-426614174000",
            status: "400",
            title: "Bad Request",
          },
          {
            code: "BadRequest",
            detail: "Additional error details",
            id: "223e4567-e89b-12d3-a456-426614174001",
            status: "404",
            title: "Not Found",
          },
        ],
      },
    },
  ])("$name", ({ input }) => {
    const actual = apiErrors.safeParse(input);

    expectToBeSafeParseSuccess(actual);
    expect(actual.data).toStrictEqual(input);
  });

  it.each<{ errorMessage: string; input: unknown; name: string }>([
    {
      name: "rejects missing required fields",
      input: {
        errors: [
          {
            code: "InvalidArgument",
            status: "400",
          },
        ],
      },
      errorMessage: "Required",
    },
    {
      name: "rejects non-string values",
      input: {
        errors: [
          {
            code: 123,
            id: "123e4567-e89b-12d3-a456-426614174000",
            status: 400,
            title: "Bad Request",
          },
        ],
      },
      errorMessage: "Expected string, received number",
    },
  ])("$name", ({ input, errorMessage }) => {
    const actual = apiErrors.safeParse(input);

    expectToBeSafeParseError(actual);
    expect(actual.error.message).toContain(errorMessage);
  });
});

describe(apiErrorsWith, () => {
  const error = { code: "forbidden", id: "request-1", status: "403" };
  const stepUpError = apiError.extend({
    source: apiErrorSource.optional(),
    meta: z.object({ stepUpMethod: z.enum(["otp", "password"]) }),
  });

  it.each([
    { pointer: "/data/attributes/name" },
    { pointer: "" },
    { parameter: "workerId" },
    { header: "authorization" },
    { pointer: "/data", parameter: "workerId", header: "authorization" },
  ])("preserves declared source members: %j", (source) => {
    const body = { errors: [{ ...error, source, meta: { stepUpMethod: "otp" } }] };

    expect(apiErrorsWith(stepUpError).parse(body)).toStrictEqual(body);
  });

  it.each([{ pointer: 42 }, { parameter: false }, { header: [] }, null, "name"])(
    "rejects invalid source: %j",
    (source) => {
      expect(apiErrorSource.safeParse(source).success).toBe(false);
    },
  );

  it("keeps source optional and narrows per-error metadata", () => {
    const schema = apiErrorsWith(stepUpError);
    const body = { errors: [{ ...error, meta: { stepUpMethod: "otp" } }] };

    expect(schema.parse(body)).toStrictEqual(body);
    expectTypeOf<z.output<typeof schema>["errors"][number]["meta"]>().toEqualTypeOf<{
      stepUpMethod: "otp" | "password";
    }>();
  });

  it.each([undefined, { stepUpMethod: "unknown" }, { stepUpMethod: 1 }])(
    "rejects missing or invalid required metadata: %j",
    (meta) => {
      expect(apiErrorsWith(stepUpError).safeParse({ errors: [{ ...error, meta }] }).success).toBe(
        false,
      );
    },
  );

  it("composes optional per-error and top-level metadata without moving either", () => {
    const accessError = apiError.extend({
      code: z.literal("workplaceDocumentAccessNotPermitted"),
      meta: z.object({ reason: z.literal("homeHealthBookingRequired") }).optional(),
    });
    const schema = apiErrorsWith(accessError).extend({
      meta: z.object({ unmetPrerequisites: z.array(z.string()).min(1) }),
    });
    const body = {
      errors: [
        {
          ...error,
          code: "workplaceDocumentAccessNotPermitted",
          meta: { reason: "homeHealthBookingRequired" },
        },
      ],
      meta: { unmetPrerequisites: ["signedConsent"] },
    };

    expect(schema.parse(body)).toStrictEqual(body);
    expect(schema.safeParse({ errors: body.errors }).success).toBe(false);
    expect(schema.safeParse({ ...body, meta: { unmetPrerequisites: [] } }).success).toBe(false);
    expect(
      schema.parse({ ...body, errors: [{ ...body.errors[0], meta: undefined }] }).errors,
    ).toHaveLength(1);
    expectTypeOf<z.output<typeof schema>["meta"]>().toEqualTypeOf<{
      unmetPrerequisites: string[];
    }>();
  });

  it("strips undeclared members at every level", () => {
    const schema = apiErrorsWith(stepUpError).extend({ meta: z.object({ attempt: z.number() }) });

    expect(
      schema.parse({
        errors: [
          {
            ...error,
            extra: true,
            source: { pointer: "/data", extra: true },
            meta: { stepUpMethod: "otp", secret: true },
          },
        ],
        meta: { attempt: 1, secret: true },
        secret: true,
      }),
    ).toStrictEqual({
      errors: [{ ...error, source: { pointer: "/data" }, meta: { stepUpMethod: "otp" } }],
      meta: { attempt: 1 },
    });
  });

  it("does not opt existing schemas into extensions", () => {
    const extended = {
      ...error,
      source: { pointer: "/data" },
      meta: { stepUpMethod: "otp" },
    };

    expect(apiError.parse(extended)).toStrictEqual(error);
    expect(apiErrors.parse({ errors: [extended], meta: { attempt: 1 } })).toStrictEqual({
      errors: [error],
    });
    expect(apiErrorsWith(apiError).parse({ errors: [extended], meta: {} })).toStrictEqual({
      errors: [error],
    });
  });

  it("retains the existing error requirements and array bounds", () => {
    const schema = apiErrorsWith(apiError.extend({ source: apiErrorSource.optional() }));

    expect(schema.parse({ errors: [] })).toStrictEqual({ errors: [] });
    expect(schema.safeParse({ errors: Array.from({ length: 100 }, () => error) }).success).toBe(
      true,
    );
    expect(schema.safeParse({ errors: Array.from({ length: 101 }, () => error) }).success).toBe(
      false,
    );
    expect(schema.safeParse({ errors: [{ code: "forbidden", status: "403" }] }).success).toBe(
      false,
    );
    expect(schema.safeParse({ errors: [{ ...error, code: "" }] }).success).toBe(false);
  });
});
