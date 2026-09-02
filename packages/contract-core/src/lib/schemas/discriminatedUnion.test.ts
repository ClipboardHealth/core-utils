import {
  expectToBeSafeParseError,
  expectToBeSafeParseSuccess,
} from "@clipboard-health/testing-core";
import { z } from "zod";

import { discriminatedUnionWithFallback } from "./discriminatedUnion";
import { ENUM_FALLBACK } from "./enum";

const TRIGGER_TYPES = ["DNR_COUNT", "SHIFT_CANCELLATION"] as const;

const { request, response } = discriminatedUnionWithFallback("type", TRIGGER_TYPES, {
  DNR_COUNT: z.object({
    type: z.literal("DNR_COUNT"),
    dnrCount: z.number().int().positive(),
    lookbackDays: z.number().int().positive().nullable(),
  }),
  SHIFT_CANCELLATION: z.object({
    type: z.literal("SHIFT_CANCELLATION"),
    cancellationCount: z.number().int().positive(),
  }),
});

const DNR_COUNT_TRIGGER = { type: "DNR_COUNT", dnrCount: 3, lookbackDays: 30 } as const;
const SHIFT_CANCELLATION_TRIGGER = { type: "SHIFT_CANCELLATION", cancellationCount: 2 } as const;

describe(discriminatedUnionWithFallback, () => {
  describe("request", () => {
    describe("success cases", () => {
      it.each<{ expected: unknown; input: unknown; name: string }>([
        {
          name: "accepts the first known variant",
          input: DNR_COUNT_TRIGGER,
          expected: DNR_COUNT_TRIGGER,
        },
        {
          name: "accepts a later known variant",
          input: SHIFT_CANCELLATION_TRIGGER,
          expected: SHIFT_CANCELLATION_TRIGGER,
        },
        {
          name: "accepts a nullable field set to null",
          input: { type: "DNR_COUNT", dnrCount: 3, lookbackDays: null },
          expected: { type: "DNR_COUNT", dnrCount: 3, lookbackDays: null },
        },
      ])("$name", ({ input, expected }) => {
        const actual = request.safeParse(input);

        expectToBeSafeParseSuccess(actual);
        expect(actual.data).toStrictEqual(expected);
      });
    });

    describe("error cases", () => {
      it.each<{ input: unknown; name: string }>([
        {
          name: "rejects an unknown discriminator",
          input: { type: "WORKPLACE_RATING", rating: 1 },
        },
        {
          name: "rejects an unknown key on a known variant",
          input: { ...DNR_COUNT_TRIGGER, unknownKey: "value" },
        },
        {
          name: "rejects a missing field",
          input: { type: "DNR_COUNT", dnrCount: 3 },
        },
        {
          name: "rejects an invalid value",
          input: { ...DNR_COUNT_TRIGGER, dnrCount: "three" },
        },
        { name: "rejects a missing discriminator", input: { dnrCount: 3, lookbackDays: 30 } },
        { name: "rejects a non-object", input: "DNR_COUNT" },
      ])("$name", ({ input }) => {
        const actual = request.safeParse(input);

        expectToBeSafeParseError(actual);
      });
    });
  });

  describe("response", () => {
    describe("success cases", () => {
      it.each<{ expected: unknown; input: unknown; name: string }>([
        {
          name: "accepts the first known variant",
          input: DNR_COUNT_TRIGGER,
          expected: DNR_COUNT_TRIGGER,
        },
        {
          name: "accepts a later known variant",
          input: SHIFT_CANCELLATION_TRIGGER,
          expected: SHIFT_CANCELLATION_TRIGGER,
        },
        {
          name: "strips an unknown key from a known variant",
          input: { ...DNR_COUNT_TRIGGER, unknownKey: "value" },
          expected: DNR_COUNT_TRIGGER,
        },
        {
          name: "collapses an unknown discriminator to the fallback",
          input: { type: "WORKPLACE_RATING", rating: 1 },
          expected: { type: ENUM_FALLBACK },
        },
        {
          name: "collapses an unknown discriminator carrying no other fields",
          input: { type: "WORKPLACE_RATING" },
          expected: { type: ENUM_FALLBACK },
        },
      ])("$name", ({ input, expected }) => {
        const actual = response.safeParse(input);

        expectToBeSafeParseSuccess(actual);
        expect(actual.data).toStrictEqual(expected);
      });
    });

    describe("error cases", () => {
      it.each<{ input: unknown; name: string }>([
        {
          name: "rejects a missing field on a known variant",
          input: { type: "DNR_COUNT", dnrCount: 3 },
        },
        {
          name: "rejects an invalid value on a known variant",
          input: { ...DNR_COUNT_TRIGGER, dnrCount: "three" },
        },
        { name: "rejects a missing discriminator", input: { dnrCount: 3, lookbackDays: 30 } },
        { name: "rejects a non-string discriminator", input: { type: 1 } },
        { name: "rejects a non-object", input: "DNR_COUNT" },
      ])("$name", ({ input }) => {
        const actual = response.safeParse(input);

        expectToBeSafeParseError(actual);
      });
    });
  });

  describe("variant composition", () => {
    const base = z.object({ id: z.string() });
    const KINDS = ["LICENSE", "CERTIFICATE"] as const;

    const composed = discriminatedUnionWithFallback("requirementType", KINDS, {
      LICENSE: base.extend({
        requirementType: z.literal("LICENSE"),
        licenseNumber: z.string(),
      }),
      CERTIFICATE: base
        .extend({ requirementType: z.literal("CERTIFICATE"), issuer: z.string() })
        .strict(),
    });

    it("accepts a variant extended from a shared base", () => {
      const actual = composed.request.safeParse({
        requirementType: "LICENSE",
        id: "1",
        licenseNumber: "abc",
      });

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toStrictEqual({
        requirementType: "LICENSE",
        id: "1",
        licenseNumber: "abc",
      });
    });

    it("strips unknown keys on the response even when the caller passed a strict variant", () => {
      const actual = composed.response.safeParse({
        requirementType: "CERTIFICATE",
        id: "1",
        issuer: "Board",
        unknownKey: "value",
      });

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toStrictEqual({
        requirementType: "CERTIFICATE",
        id: "1",
        issuer: "Board",
      });
    });

    it("collapses an unknown discriminator under a custom discriminator key", () => {
      const actual = composed.response.safeParse({ requirementType: "IMMUNIZATION", doses: 2 });

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toStrictEqual({ requirementType: ENUM_FALLBACK });
    });
  });

  describe("inferred types", () => {
    it("narrows request to the known variants", () => {
      const trigger: z.infer<typeof request> = DNR_COUNT_TRIGGER;
      // @ts-expect-error -- requests carry no fallback variant.
      const fallback: z.infer<typeof request> = { type: ENUM_FALLBACK };
      // @ts-expect-error -- a variant's own fields stay required.
      const partial: z.infer<typeof request> = { type: "DNR_COUNT" };

      expect([trigger, fallback, partial]).toHaveLength(3);
    });

    it("widens response to the known variants plus the fallback", () => {
      const trigger: z.infer<typeof response> = SHIFT_CANCELLATION_TRIGGER;
      const fallback: z.infer<typeof response> = { type: ENUM_FALLBACK };
      // @ts-expect-error -- the fallback variant carries the discriminator alone.
      const unknownVariant: z.infer<typeof response> = { type: "WORKPLACE_RATING", rating: 1 };

      expect([trigger, fallback, unknownVariant]).toHaveLength(3);
    });
  });

  describe("misuse", () => {
    it("throws when values include the fallback sentinel", () => {
      expect(() =>
        discriminatedUnionWithFallback("type", [ENUM_FALLBACK], {
          [ENUM_FALLBACK]: z.object({ type: z.literal(ENUM_FALLBACK) }),
        }),
      ).toThrow(`Discriminator values must not include "${ENUM_FALLBACK}"`);
    });

    it("rejects a variant declaring a literal that does not match its key", () => {
      expect(() =>
        discriminatedUnionWithFallback("type", ["A", "B"], {
          A: z.object({ type: z.literal("A") }),
          // @ts-expect-error -- the literal must match the record key.
          B: z.object({ type: z.literal("A") }),
        }),
      ).toThrow('Variant "B" must declare type: z.literal("B") in its shape.');
    });

    it("rejects a variant omitting the discriminator", () => {
      expect(() =>
        // @ts-expect-error -- every variant must declare the discriminator.
        discriminatedUnionWithFallback("type", ["A"], { A: z.object({ id: z.string() }) }),
      ).toThrow('Variant "A" must declare type: z.literal("A") in its shape.');
    });

    it("rejects a value with no variant", () => {
      expect(() =>
        discriminatedUnionWithFallback(
          "type",
          ["A", "B"],
          // @ts-expect-error -- every value needs a variant, otherwise it silently reads as fallback.
          { A: z.object({ type: z.literal("A") }) },
        ),
      ).toThrow('Missing variant schema for discriminator value "B".');
    });

    it("rejects a variant with no value", () => {
      expect(() =>
        discriminatedUnionWithFallback("type", ["A"], {
          A: z.object({ type: z.literal("A") }),
          // @ts-expect-error -- a variant outside the values would be dropped and read as fallback.
          B: z.object({ type: z.literal("B") }),
        }),
      ).toThrow('Variant "B" is missing from the discriminator values.');
    });

    it("rejects widened string values", () => {
      const widened = ["A", "B"];

      expect(() =>
        // @ts-expect-error -- values must be `as const` so exhaustiveness can be checked.
        discriminatedUnionWithFallback("type", widened, {
          A: z.object({ type: z.literal("A") }),
          B: z.object({ type: z.literal("B") }),
        }),
      ).not.toThrow();
    });
  });
});
