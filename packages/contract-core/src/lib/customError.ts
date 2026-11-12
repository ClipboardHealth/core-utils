import type { StandardSchemaV1 } from "@standard-schema/spec";
import { z } from "zod";

/**
 * Marks custom error schemas and responses across copies of this package, such as its CommonJS and
 * ESM builds loaded together. It's set at runtime only, so public types never name it.
 */
const CUSTOM_ERROR = Symbol.for("@clipboard-health/contract-core/custom-error/v1");

/** A custom error response: its original body and optional response headers. */
export interface CustomErrorDocument<Body = unknown> {
  body: Body;
  headers?: Record<string, string>;
}

/** The validated value of a custom error schema. Read it with `getCustomErrorResponse`. */
export interface CustomErrorResponse {
  readonly document: CustomErrorDocument;
}

/** The Standard Schema a `customError` declaration validates its error data with. */
export interface CustomErrorBodySchema<
  BodySchema extends z.ZodType<unknown>,
> extends StandardSchemaV1<CustomErrorDocument<z.input<BodySchema>>, CustomErrorResponse> {
  readonly bodySchema: BodySchema;
}

/** A custom error declaration, for a contract's error map. */
export interface CustomErrorDeclaration<BodySchema extends z.ZodType<unknown>> {
  status: number;
  data: CustomErrorBodySchema<BodySchema>;
}

const errorDocumentSchema = z.object({
  body: z.unknown(),
  headers: z.record(z.string()).optional(),
});

export function customError<BodySchema extends z.ZodType<unknown>>(params: {
  status: number;
  body: BodySchema;
}): CustomErrorDeclaration<BodySchema> {
  const { status, body } = params;
  return { status, data: createBodySchema(body) };
}

export function getCustomErrorResponse(params: { data: unknown }): CustomErrorDocument | undefined {
  const { data } = params;
  return isCustomErrorResponse(data) ? data.document : undefined;
}

export function getCustomErrorBodySchema(params: {
  schema: unknown;
}): z.ZodType<unknown> | undefined {
  const { schema } = params;
  return isCustomErrorBodySchema(schema) ? schema.bodySchema : undefined;
}

function createBodySchema<BodySchema extends z.ZodType<unknown>>(
  bodySchema: BodySchema,
): CustomErrorBodySchema<BodySchema> {
  return brand(
    {
      bodySchema,
      "~standard": {
        version: 1,
        vendor: "clipboard-custom-error",
        validate: (input) => {
          const isResponse = isCustomErrorResponse(input);
          // Issue paths are relative to the validated input, which wraps a marked response's fields.
          const documentPath = isResponse ? ["document"] : [];
          const document = errorDocumentSchema.safeParse(isResponse ? input.document : input);
          if (!document.success) {
            return {
              issues: prefixIssuePaths({ issues: document.error.issues, prefix: documentPath }),
            };
          }
          const result = bodySchema.safeParse(document.data.body);
          if (!result.success) {
            return {
              issues: prefixIssuePaths({
                issues: result.error.issues,
                prefix: [...documentPath, "body"],
              }),
            };
          }
          return {
            value: createResponse({
              body: document.data.body,
              ...(document.data.headers ? { headers: document.data.headers } : {}),
            }),
          };
        },
      },
    },
    "schema",
  );
}

function createResponse(document: CustomErrorDocument): CustomErrorResponse {
  return brand({ document }, "response");
}

function brand<T extends object>(value: T, kind: "schema" | "response"): T {
  return Object.defineProperty(value, CUSTOM_ERROR, { value: kind, enumerable: false });
}

function prefixIssuePaths(params: {
  issues: z.ZodIssue[];
  prefix: string[];
}): StandardSchemaV1.Issue[] {
  const { issues, prefix } = params;
  return issues.map((issue) => ({ ...issue, path: [...prefix, ...issue.path] }));
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
