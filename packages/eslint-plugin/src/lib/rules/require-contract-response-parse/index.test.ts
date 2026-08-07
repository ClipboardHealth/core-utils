import { TSESLint } from "@typescript-eslint/utils";

import rule from "./index";

// eslint-disable-next-line n/no-unpublished-require
const parser = require.resolve("@typescript-eslint/parser");

const ruleTester = new TSESLint.RuleTester({
  parser,
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

// oxlint-disable-next-line vitest/expect-expect -- RuleTester validates declaratively
ruleTester.run("require-contract-response-parse", rule, {
  valid: [
    {
      name: "contract schema parses the response before a shape assertion",
      code: `
        import { ExampleResponseSchema } from "@clipboard-health/contract-example";
        it("parses", () => {
          const response = getResponse();
          const body = parseBody(response, ExampleResponseSchema);
          expect(response.parsedBody).toMatchObject(body);
        });
      `,
    },
    {
      name: "contract schema parses parsedBody directly",
      code: `
        import { ExampleResponseSchema } from "@clipboard-health/contract-example";
        it("parses", () => {
          const response = getResponse();
          const body = ExampleResponseSchema.parse(response.parsedBody);
          expect(response.parsedBody.data).toEqual(body.data);
        });
      `,
    },
    {
      name: "async contract schema parses parsedBody directly",
      code: `
        import { ExampleResponseSchema } from "@clipboard-health/contract-example";
        it("parses asynchronously", async () => {
          const response = getResponse();
          const body = await ExampleResponseSchema.parseAsync(response.parsedBody);
          expect(response.parsedBody.data).toEqual(body.data);
        });
      `,
    },
    {
      name: "contract response map supplies the schema",
      code: `
        import { exampleContract } from "@clipboard-health/contract-example";
        it("parses inline", () => {
          const response = getResponse();
          expect(parseBody(response, exampleContract.get.responses[200])).toMatchObject({});
        });
      `,
    },
    {
      name: "TypeScript wrappers preserve contract parse evidence",
      code: `
        import { ExampleResponseSchema } from "@clipboard-health/contract-example";
        it("parses a typed response", () => {
          const response = getResponse();
          ExampleResponseSchema.parse(response.parsedBody as unknown);
          expect((response as Response).parsedBody.data).toEqual([]);
        });
      `,
    },
    {
      name: "contract schema can parse an inline awaited response body",
      code: `
        import { ExampleResponseSchema } from "@clipboard-health/contract-example";
        it("parses an inline response", async () => {
          ExampleResponseSchema.parse((await getResponse()).parsedBody);
        });
      `,
    },
    {
      name: "satisfies wrapper preserves contract parse evidence",
      code: `
        import { ExampleResponseSchema } from "@clipboard-health/contract-example";
        it("parses a response with a satisfies wrapper", () => {
          const response = getResponse();
          parseBody(response, ExampleResponseSchema);
          expect((response satisfies Response).parsedBody).toEqual({});
        });
      `,
    },
    {
      name: "parse and assertion in the same control-flow branch",
      code: `
        import { ExampleResponseSchema } from "@clipboard-health/contract-example";
        it("parses inside the branch", () => {
          const response = getResponse();
          if (shouldParse) {
            parseBody(response, ExampleResponseSchema);
            expect(response.parsedBody).toEqual({});
          }
        });
      `,
    },
    {
      name: "status-only assertion does not inspect response shape",
      code: `
        it("only checks status", () => {
          const response = getResponse();
          expect(response.statusCode).toBe(204);
        });
      `,
    },
    {
      name: "unrelated any method is not a Zod schema",
      code: `
        const helper = { any: () => true };
        helper.any();
      `,
    },
  ],
  invalid: [
    {
      name: "response shape assertion without a contract parse",
      code: `
        it("does not parse", () => {
          const response = getResponse();
          expect(response.parsedBody).toMatchObject({ data: [] });
        });
      `,
      errors: [{ messageId: "missingContractParse" }],
    },
    {
      name: "contract parse after the assertion",
      code: `
        import { ExampleResponseSchema } from "@clipboard-health/contract-example";
        it("parses too late", () => {
          const response = getResponse();
          expect(response.parsedBody.data).toEqual([]);
          parseBody(response, ExampleResponseSchema);
        });
      `,
      errors: [{ messageId: "missingContractParse" }],
    },
    {
      name: "local strict schema is not the contract oracle",
      code: `
        import { z } from "zod";
        it("uses a local strict schema", () => {
          const response = getResponse();
          const LocalResponseSchema = z.object({ data: z.array(z.string()) });
          const result = LocalResponseSchema.safeParse(response.parsedBody);
          expect(result.success).toBe(true);
        });
      `,
      errors: [{ messageId: "missingContractParse" }],
    },
    {
      name: "parseBody with a local schema is not the contract oracle",
      code: `
        import { z } from "zod";
        it("passes a local schema to parseBody", () => {
          const response = getResponse();
          const LocalResponseSchema = z.object({ data: z.array(z.string()) });
          const body = parseBody(response, LocalResponseSchema);
          expect(body).toMatchObject({ data: [] });
        });
      `,
      errors: [{ messageId: "nonContractSchema" }],
    },
    {
      name: "parse evidence does not cross test functions",
      code: `
        import { ExampleResponseSchema } from "@clipboard-health/contract-example";
        it("parses one response", () => {
          const response = getResponse();
          parseBody(response, ExampleResponseSchema);
        });
        it("does not let another test satisfy this one", () => {
          const response = getResponse();
          expect(response.parsedBody).toEqual({});
        });
      `,
      errors: [{ messageId: "missingContractParse" }],
    },
    {
      name: "shadowed contract import is not a contract schema",
      code: `
        import { ExampleResponseSchema } from "@clipboard-health/contract-example";
        it("rejects a shadowed contract schema", (ExampleResponseSchema) => {
          const response = getResponse();
          parseBody(response, ExampleResponseSchema);
          expect(response.parsedBody).toEqual({});
        });
      `,
      errors: [{ messageId: "nonContractSchema" }, { messageId: "missingContractParse" }],
    },
    {
      name: "conditional parse does not dominate a later assertion",
      code: `
        import { ExampleResponseSchema } from "@clipboard-health/contract-example";
        it("rejects conditional parse evidence", () => {
          const response = getResponse();
          if (shouldParse) {
            parseBody(response, ExampleResponseSchema);
          }
          expect(response.parsedBody).toEqual({});
        });
      `,
      errors: [{ messageId: "missingContractParse" }],
    },
    {
      name: "response reassignment invalidates earlier parse evidence",
      code: `
        import { ExampleResponseSchema } from "@clipboard-health/contract-example";
        it("rejects parse evidence before reassignment", () => {
          let response = getResponse();
          parseBody(response, ExampleResponseSchema);
          response = getAnotherResponse();
          expect(response.parsedBody).toEqual({});
        });
      `,
      errors: [{ messageId: "missingContractParse" }],
    },
    {
      name: "schema parsing a nested value does not validate the response body",
      code: `
        import { ExampleResponseSchema } from "@clipboard-health/contract-example";
        it("parses only a nested value", () => {
          const response = getResponse();
          ExampleResponseSchema.parse(response.parsedBody.data);
          expect(response.parsedBody).toEqual({ data: [] });
        });
      `,
      errors: [{ messageId: "missingContractParse" }, { messageId: "missingContractParse" }],
    },
    {
      name: "whole-response shape assertion includes parsedBody",
      code: `
        it("asserts the whole response", () => {
          const response = getResponse();
          expect(response).toMatchObject({ statusCode: 200, parsedBody: { data: [] } });
        });
      `,
      errors: [{ messageId: "missingContractParse" }],
    },
    {
      name: "negated whole-response shape assertion includes parsedBody",
      code: `
        it("asserts the whole response with not", () => {
          const response = getResponse();
          expect(response).not.toMatchObject({ parsedBody: { data: [] } });
        });
      `,
      errors: [{ messageId: "missingContractParse" }],
    },
    {
      name: "resolved whole-response shape assertion includes parsedBody",
      code: `
        it("asserts a resolved response", async () => {
          const responsePromise = getResponse();
          await expect(responsePromise).resolves.toMatchObject({ parsedBody: { data: [] } });
        });
      `,
      errors: [{ messageId: "missingContractParse" }],
    },
    {
      name: "string property path reaches parsedBody",
      code: `
        it("asserts a parsedBody string path", () => {
          const response = getResponse();
          expect(response).toHaveProperty("parsedBody.preference.distance", 100);
        });
      `,
      errors: [{ messageId: "missingContractParse" }],
    },
    {
      name: "array property path reaches parsedBody",
      code: `
        it("asserts a parsedBody array path", () => {
          const response = getResponse();
          expect(response).toHaveProperty(["parsedBody", "preference", "distance"], 100);
        });
      `,
      errors: [{ messageId: "missingContractParse" }],
    },
    {
      name: "parsedBody destructuring requires a prior contract parse",
      code: `
        it("destructures an unparsed response", async () => {
          const { parsedBody } = await getResponse();
          expect(parsedBody).toMatchObject({ data: [] });
        });
      `,
      errors: [{ messageId: "missingContractParse" }],
    },
    {
      name: "inline z.any schema is not a contract oracle",
      code: `
        import { z } from "zod";
        it("uses an inline any schema", () => {
          const response = getResponse();
          const schema = z.record(z.string(), z.any());
          schema.parse(response.parsedBody);
          expect(response.parsedBody).toEqual({});
        });
      `,
      errors: [
        { messageId: "inlineAnySchema", data: { method: "any" } },
        { messageId: "missingContractParse" },
        { messageId: "missingContractParse" },
      ],
    },
    {
      name: "aliased z.unknown schema is not a contract oracle",
      code: `
        import { z as schema } from "zod";
        const LooseResponseSchema = schema.array(schema.unknown());
      `,
      errors: [{ messageId: "inlineAnySchema", data: { method: "unknown" } }],
    },
    {
      name: "namespace z.any schema is not a contract oracle",
      code: `
        import * as z from "zod";
        const LooseResponseSchema = z.array(z.any());
      `,
      errors: [{ messageId: "inlineAnySchema", data: { method: "any" } }],
    },
    {
      name: "default-imported z.any schema is not a contract oracle",
      code: `
        import z from "zod";
        const LooseResponseSchema = z.array(z.any());
      `,
      errors: [{ messageId: "inlineAnySchema", data: { method: "any" } }],
    },
    {
      name: "inline awaited response shape requires a contract parse",
      code: `
        it("asserts an inline response", async () => {
          expect((await getResponse()).parsedBody).toEqual({});
        });
      `,
      errors: [{ messageId: "missingContractParse" }],
    },
  ],
});
