import { TSESLint } from "@typescript-eslint/utils";

import rule from "./index";

// eslint-disable-next-line n/no-unpublished-require
const parser = require.resolve("@typescript-eslint/parser");

const ruleTester = new TSESLint.RuleTester({
  parser,
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
});

const mocksFile = "/repo/src/app/Feature/api/testUtils/mocks.ts";
const handlersFile = "/repo/src/app/Feature/api/test-utils/handlers.ts";
const playwrightFile = "/repo/playwright/e2e/feature.spec.ts";

// oxlint-disable-next-line vitest/expect-expect -- RuleTester validates declaratively
ruleTester.run("require-contract-fixture-construction", rule, {
  valid: [
    {
      name: "accepts an exported fixture parsed by an imported response schema",
      filename: mocksFile,
      code: `
        import { FeatureResponseSchema } from "@clipboard-health/contract-feature";
        export const mockFeature = FeatureResponseSchema.parse({ id: "feature" });
      `,
    },
    {
      name: "accepts a response-map schema through a forward-declared builder",
      filename: mocksFile,
      code: `
        import { featureContract } from "@clipboard-health/contract-feature";
        import { createContractFixtureBuilder as createFixture } from "@clipboard-health/testing-core";
        export const mockFeature = buildFeature();
        const buildFeature = createFixture({
          schema: featureContract.get.responses[200],
          defaults: { id: "feature" },
        });
      `,
    },
    {
      name: "accepts fixtures imported from an enforced sibling mocks module",
      filename: handlersFile,
      code: `
        import { mockFeature } from "./mocks";
        export const handler = rest.get("/feature", (_request, response, ctx) =>
          response(ctx.json(mockFeature))
        );
      `,
    },
    {
      name: "accepts aliased HttpResponse and parsed payloads",
      filename: handlersFile,
      code: `
        import { FeatureResponseSchema } from "@clipboard-health/contract-feature";
        import { HttpResponse as Response } from "msw";
        const payload = FeatureResponseSchema.parse({ id: "feature" });
        export const handler = http.get("/feature", () => Response.json(payload));
      `,
    },
    {
      name: "accepts a parsed fixture after read-only inspection",
      filename: handlersFile,
      code: `
        import { FeatureResponseSchema } from "@clipboard-health/contract-feature";
        const payload = FeatureResponseSchema.parse({ id: "feature" });
        expect(payload).toMatchObject({ id: "feature" });
        observe(payload);
        context.json(payload);
      `,
    },
    {
      name: "ignores unrelated json and fulfill methods",
      filename: handlersFile,
      code: `
        logger.json({ freehand: true });
        promise.fulfill({ json: { freehand: true } });
      `,
    },
    {
      name: "accepts parsed Playwright shorthand and spread payloads",
      filename: playwrightFile,
      code: `
        import { FeatureResponseSchema } from "@clipboard-health/contract-feature";
        const json = FeatureResponseSchema.parse({ id: "feature" });
        const base = { status: 200, json };
        await route.fulfill({ ...base, headers: {} });
      `,
    },
  ],
  invalid: [
    {
      name: "rejects a freehand exported mock",
      filename: mocksFile,
      code: `export const mockFeature = { id: "feature" };`,
      errors: [{ messageId: "parseMock" }],
    },
    {
      name: "rejects a local schema copy",
      filename: mocksFile,
      code: `
        import { z } from "zod";
        const LocalResponseSchema = z.object({ id: z.string() });
        export const mockFeature = LocalResponseSchema.parse({ id: "feature" });
      `,
      errors: [{ messageId: "parseMock" }],
    },
    {
      name: "rejects request and nested contract schemas",
      filename: mocksFile,
      code: `
        import { featureContract } from "@clipboard-health/contract-feature";
        export const mockRequest = featureContract.get.body.parse({ id: "feature" });
        export const mockNested = featureContract.get.responses[200].shape.data.parse([]);
      `,
      errors: [{ messageId: "parseMock" }, { messageId: "parseMock" }],
    },
    {
      name: "rejects a shadowed contract schema",
      filename: handlersFile,
      code: `
        import { FeatureResponseSchema } from "@clipboard-health/contract-feature";
        export const handler = (FeatureResponseSchema) =>
          context.json(FeatureResponseSchema.parse({ id: "feature" }));
      `,
      errors: [{ messageId: "parsePayload" }],
    },
    {
      name: "rejects parsed fixtures mutated before MSW observes them",
      filename: handlersFile,
      code: `
        import { FeatureResponseSchema } from "@clipboard-health/contract-feature";
        const payload = FeatureResponseSchema.parse({ items: [] });
        payload.items.push({ id: "drift" });
        context.json(payload);
      `,
      errors: [{ messageId: "parsePayload" }],
    },
    {
      name: "rejects direct and indirect exports mutated later in the module",
      filename: mocksFile,
      code: `
        import { FeatureResponseSchema } from "@clipboard-health/contract-feature";
        export const mockDirect = FeatureResponseSchema.parse({ items: [] });
        mockDirect.items.push({ id: "drift" });

        const mockIndirect = FeatureResponseSchema.parse({ items: [] });
        export { mockIndirect };
        mockIndirect.items.push({ id: "drift" });
      `,
      errors: [{ messageId: "parseMock" }, { messageId: "parseMock" }],
    },
    {
      name: "propagates mutation through aliases",
      filename: handlersFile,
      code: `
        import { FeatureResponseSchema } from "@clipboard-health/contract-feature";
        const payload = FeatureResponseSchema.parse({ items: [] });
        const alias = payload.items;
        alias.push({ id: "drift" });
        context.json(payload);
      `,
      errors: [{ messageId: "parsePayload" }],
    },
    {
      name: "propagates mutations through destructured aliases",
      filename: handlersFile,
      code: `
        import { FeatureResponseSchema } from "@clipboard-health/contract-feature";
        const payload = FeatureResponseSchema.parse({ items: [] });
        const { items } = payload;
        items.push({ id: "drift" });
        context.json(payload);
      `,
      errors: [{ messageId: "parsePayload" }],
    },
    {
      name: "rejects freehand MSW response forms",
      filename: handlersFile,
      code: `
        import { HttpResponse } from "msw";
        context.json({ first: true });
        ctx.json({ second: true });
        HttpResponse.json({ third: true });
      `,
      errors: [
        { messageId: "parsePayload" },
        { messageId: "parsePayload" },
        { messageId: "parsePayload" },
      ],
    },
    {
      name: "rejects Playwright options aliases, shorthand, and serialized bodies",
      filename: playwrightFile,
      code: `
        const json = { first: true };
        const firstOptions = { json };
        await route.fulfill(firstOptions);
        const body = JSON.stringify({ second: true });
        await apiRoute.fulfill({ body });
      `,
      errors: [{ messageId: "parsePayload" }, { messageId: "parsePayload" }],
    },
    {
      name: "rejects Playwright route aliases with freehand payloads",
      filename: playwrightFile,
      code: `await r.fulfill({ json: { freehand: true } });`,
      errors: [{ messageId: "parsePayload" }],
    },
    {
      name: "fails closed on unresolved Playwright spreads",
      filename: playwrightFile,
      code: `
        import { FeatureResponseSchema } from "@clipboard-health/contract-feature";
        const parsed = FeatureResponseSchema.parse({ id: "feature" });
        await route.fulfill({ json: parsed, ...unknownOptions });
      `,
      errors: [{ messageId: "parsePayload" }],
    },
    {
      name: "rejects exported fixture builders returning freehand values",
      filename: mocksFile,
      code: `export function makeFixture() { return { id: "feature" }; }`,
      errors: [{ messageId: "parseMock" }],
    },
  ],
});
