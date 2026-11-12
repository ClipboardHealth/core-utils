import type { StandardSchemaV1 } from "@standard-schema/spec";
import { z } from "zod";

const CUSTOM_ERROR = Symbol.for("@clipboard-health/contract-core/custom-error/v1");

type ErrorDocument<Body> = { body: Body; headers?: Record<string, string> };

const errorDocumentSchema = z.object({
  body: z.unknown(),
  headers: z.record(z.string()).optional(),
});

class CustomErrorResponse {
  public readonly [CUSTOM_ERROR] = "response";

  public constructor(public readonly document: ErrorDocument<unknown>) {}
}

class CustomErrorBodySchema<BodySchema extends z.ZodType<unknown>> implements StandardSchemaV1<
  ErrorDocument<z.input<BodySchema>>,
  CustomErrorResponse
> {
  public readonly [CUSTOM_ERROR] = "schema";

  public readonly "~standard": StandardSchemaV1<
    ErrorDocument<z.input<BodySchema>>,
    CustomErrorResponse
  >["~standard"];

  public constructor(public readonly bodySchema: BodySchema) {
    this["~standard"] = {
      version: 1,
      vendor: "clipboard-custom-error",
      validate: async (input) => {
        const document = errorDocumentSchema.safeParse(
          isCustomErrorResponse(input) ? input.document : input,
        );
        if (!document.success) {
          return { issues: document.error.issues };
        }
        const result = await bodySchema.safeParseAsync(document.data.body);
        if (!result.success) {
          return { issues: result.error.issues };
        }
        return {
          value: new CustomErrorResponse({
            body: document.data.body,
            ...(document.data.headers ? { headers: document.data.headers } : {}),
          }),
        };
      },
    };
  }
}

export function customError<BodySchema extends z.ZodType<unknown>>(params: {
  status: number;
  body: BodySchema;
}) {
  const { status, body } = params;
  return { status, data: new CustomErrorBodySchema(body) };
}

export function getCustomErrorResponse(params: { data: unknown }) {
  const { data } = params;
  return isCustomErrorResponse(data) ? data.document : undefined;
}

export function getCustomErrorBodySchema(params: {
  schema: unknown;
}): z.ZodType<unknown> | undefined {
  const { schema } = params;
  return isCustomErrorBodySchema(schema) ? schema.bodySchema : undefined;
}

function isCustomErrorResponse(data: unknown): data is CustomErrorResponse {
  return (
    typeof data === "object" &&
    data !== null &&
    CUSTOM_ERROR in data &&
    data[CUSTOM_ERROR] === "response" &&
    "document" in data
  );
}

function isCustomErrorBodySchema(
  schema: unknown,
): schema is CustomErrorBodySchema<z.ZodType<unknown>> {
  return (
    typeof schema === "object" &&
    schema !== null &&
    CUSTOM_ERROR in schema &&
    schema[CUSTOM_ERROR] === "schema" &&
    "bodySchema" in schema
  );
}
