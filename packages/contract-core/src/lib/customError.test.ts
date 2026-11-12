import type { StandardSchemaV1 } from "@standard-schema/spec";
import { expectTypeOf } from "vitest";
import { z } from "zod";

import { apiErrors, customError, getCustomErrorBodySchema, getCustomErrorResponse } from "../index";

describe(customError, () => {
  const bodySchema = apiErrors.extend({ message: z.string() });
  const declaration = customError({ status: 403, body: bodySchema });
  const body = {
    message: "Keep the payout settings message",
    errors: [{ status: "403", code: "forbidden", id: "request-1" }],
  };

  it("preserves the original body, extra members, key order, and status", async () => {
    const original = { extra: true, ...body, meta: { attempt: 1 } };
    const result = await declaration.data["~standard"].validate({ body: original });

    expect(declaration.status).toBe(403);
    expect(declaration.data["~standard"]).toMatchObject({
      version: 1,
      vendor: "clipboard-custom-error",
    });
    expect(result.issues).toBeUndefined();
    if (!result.issues) {
      const document = getCustomErrorResponse({ data: result.value });
      expect(document?.body).toBe(original);
      expect(JSON.stringify(document?.body)).toBe(
        '{"extra":true,"message":"Keep the payout settings message","errors":[{"status":"403","code":"forbidden","id":"request-1"}],"meta":{"attempt":1}}',
      );
    }
  });

  it("preserves headers and supports repeated validation", async () => {
    const headers = { "retry-after": "30", "x-reason": "payout" };
    const first = await declaration.data["~standard"].validate({ body, headers });

    expect(first.issues).toBeUndefined();
    if (!first.issues) {
      const repeated = await declaration.data["~standard"].validate(first.value);
      expect(repeated.issues).toBeUndefined();
      if (!repeated.issues) {
        expect(getCustomErrorResponse({ data: repeated.value })).toStrictEqual({ body, headers });
      }
    }
  });

  it("validates refinements synchronously but does not apply transformations or defaults", () => {
    const schema = z.object({
      message: z
        .string()
        .refine((message) => message.length > 0)
        .transform((message) => message.toUpperCase()),
      attempt: z.number().default(1),
    });
    const original = { message: "keep lowercase" };
    const data = customError({ status: 422, body: schema }).data;
    const result = data["~standard"].validate({ body: original });

    expect(result).not.toBeInstanceOf(Promise);
    if (!(result instanceof Promise)) {
      expect(result.issues).toBeUndefined();
      if (!result.issues) {
        expect(getCustomErrorResponse({ data: result.value })?.body).toBe(original);
      }
    }
    const rejected = data["~standard"].validate({ body: { message: "" } });
    expect(rejected instanceof Promise ? undefined : rejected.issues).toBeDefined();
    expectTypeOf<StandardSchemaV1.InferInput<typeof data>>().toEqualTypeOf<{
      body: { message: string; attempt?: number | undefined };
      headers?: Record<string, string>;
    }>();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof data>["document"]["body"]>().toBeUnknown();
  });

  it.each([
    null,
    undefined,
    "not a document",
    {},
    { body: null },
    { body: { errors: [], message: 1 } },
    { body: { message: "missing errors" } },
    { body: { message: "missing id", errors: [{ status: "403", code: "forbidden" }] } },
    { body, headers: { "retry-after": 30 } },
    { body, headers: null },
  ])("rejects invalid data without marking it as validated: %j", async (input) => {
    const result = await declaration.data["~standard"].validate(input);

    expect(result.issues).toBeDefined();
    expect(getCustomErrorResponse({ data: input })).toBeUndefined();
    expect(getCustomErrorResponse({ data: result })).toBeUndefined();
  });

  it.each(["legacy message", null, ["legacy error"], 1])(
    "supports a declared non-object body: %j",
    async (original) => {
      const schema = z.union([z.string(), z.null(), z.array(z.string()), z.number()]);
      const result = await customError({ status: 400, body: schema }).data["~standard"].validate({
        body: original,
      });

      expect(result.issues).toBeUndefined();
      if (!result.issues) {
        expect(getCustomErrorResponse({ data: result.value })?.body).toBe(original);
      }
    },
  );

  it("throws on an async body refinement, which synchronous validation can't run", () => {
    const schema = z.object({ message: z.string().refine(async () => true) });

    const validate = (): unknown =>
      customError({ status: 422, body: schema }).data["~standard"].validate({
        body: { message: "x" },
      });

    expect(validate).toThrow(/async refinement/i);
  });

  it.each([
    { input: { body: { ...body, message: 1 } }, path: ["body", "message"] },
    { input: { body, headers: { "retry-after": 30 } }, path: ["headers", "retry-after"] },
    { input: {}, path: ["body"] },
  ])("reports issues at their path in the input: $path", async ({ input, path }) => {
    const result = await declaration.data["~standard"].validate(input);

    expect(result.issues?.map((issue) => issue.path)).toContainEqual(path);
  });

  it("reports a revalidated response's issues under its document", async () => {
    const result = await declaration.data["~standard"].validate({ body });
    const stricter = customError({
      status: 403,
      body: bodySchema.extend({ required: z.string() }),
    });

    expect(result.issues).toBeUndefined();
    if (!result.issues) {
      const revalidated = await stricter.data["~standard"].validate(result.value);
      expect(revalidated.issues?.map((issue) => issue.path)).toStrictEqual([
        ["document", "body", "required"],
      ]);
    }
  });

  it("revalidates rather than trusting a previously validated response", async () => {
    const result = await declaration.data["~standard"].validate({ body });
    const stricter = customError({
      status: 403,
      body: bodySchema.extend({ required: z.string() }),
    });

    expect(result.issues).toBeUndefined();
    if (!result.issues) {
      expect((await stricter.data["~standard"].validate(result.value)).issues).toBeDefined();
    }
  });

  it.each([
    undefined,
    null,
    1,
    {},
    { body },
    { document: { body } },
    { bodySchema },
    { [Symbol.for("@clipboard-health/contract-core/custom-error/v1")]: "unknown" },
    { [Symbol.for("@clipboard-health/contract-core/custom-error/v1")]: "schema" },
    { [Symbol.for("@clipboard-health/contract-core/custom-error/v1")]: "response" },
  ])("does not recognize unbranded or incomplete lookalikes: %j", (input) => {
    expect(getCustomErrorResponse({ data: input })).toBeUndefined();
    expect(getCustomErrorBodySchema({ schema: input })).toBeUndefined();
  });

  it("exposes the original body schema only for custom declarations", () => {
    expect(getCustomErrorBodySchema({ schema: declaration.data })).toBe(bodySchema);
    expect(getCustomErrorBodySchema({ schema: bodySchema })).toBeUndefined();
    expect(getCustomErrorResponse({ data: declaration.data })).toBeUndefined();
  });

  it("recognizes schemas and responses from a second module instance in both directions", async () => {
    vi.resetModules();
    const first = await import("./customError");
    vi.resetModules();
    const second = await import("./customError");
    expect(first.customError).not.toBe(second.customError);

    const firstDeclaration = first.customError({ status: 403, body: bodySchema });
    const secondDeclaration = second.customError({ status: 403, body: bodySchema });
    expect(second.getCustomErrorBodySchema({ schema: firstDeclaration.data })).toBe(bodySchema);
    expect(first.getCustomErrorBodySchema({ schema: secondDeclaration.data })).toBe(bodySchema);

    const firstResult = await firstDeclaration.data["~standard"].validate({ body });
    const secondResult = await secondDeclaration.data["~standard"].validate({ body });
    expect(firstResult.issues).toBeUndefined();
    expect(secondResult.issues).toBeUndefined();
    if (!firstResult.issues && !secondResult.issues) {
      expect(second.getCustomErrorResponse({ data: firstResult.value })).toStrictEqual({ body });
      expect(first.getCustomErrorResponse({ data: secondResult.value })).toStrictEqual({ body });
      const repeated = await secondDeclaration.data["~standard"].validate(firstResult.value);
      expect(repeated.issues).toBeUndefined();
      if (!repeated.issues) {
        expect(first.getCustomErrorResponse({ data: repeated.value })?.body).toBe(body);
        expect(getCustomErrorBodySchema({ schema: repeated.value })).toBeUndefined();
      }
    }
  });
});
