import {
  expectToBeSafeParseError,
  expectToBeSafeParseSuccess,
} from "@clipboard-health/testing-core";
import { z } from "zod";

import { discriminatedUnionWithFallback } from "./discriminatedUnion";
import { ENUM_FALLBACK } from "./enum";

const CHANNELS = ["EMAIL", "SMS"] as const;

const { request, response } = discriminatedUnionWithFallback("channel", CHANNELS, {
  EMAIL: z.object({
    channel: z.literal("EMAIL"),
    emailAddress: z.string().email(),
    replyTo: z.string().email().nullable(),
  }),
  SMS: z.object({
    channel: z.literal("SMS"),
    phoneNumber: z.string(),
  }),
});

const EMAIL_NOTIFICATION = {
  channel: "EMAIL",
  emailAddress: "worker@example.com",
  replyTo: "support@example.com",
} as const;
const SMS_NOTIFICATION = { channel: "SMS", phoneNumber: "+15555550123" } as const;

describe(discriminatedUnionWithFallback, () => {
  describe("request", () => {
    describe("success cases", () => {
      it.each<{ expected: unknown; input: unknown; name: string }>([
        {
          name: "accepts the first known variant",
          input: EMAIL_NOTIFICATION,
          expected: EMAIL_NOTIFICATION,
        },
        {
          name: "accepts a later known variant",
          input: SMS_NOTIFICATION,
          expected: SMS_NOTIFICATION,
        },
        {
          name: "accepts a nullable field set to null",
          input: { channel: "EMAIL", emailAddress: "worker@example.com", replyTo: null },
          expected: { channel: "EMAIL", emailAddress: "worker@example.com", replyTo: null },
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
          input: { channel: "PUSH", deviceToken: "abc123" },
        },
        {
          name: "rejects an unknown key on a known variant",
          input: { ...EMAIL_NOTIFICATION, unknownKey: "value" },
        },
        {
          name: "rejects a missing field",
          input: { channel: "EMAIL", emailAddress: "worker@example.com" },
        },
        {
          name: "rejects an invalid value",
          input: { ...EMAIL_NOTIFICATION, emailAddress: "not-an-email" },
        },
        {
          name: "rejects a missing discriminator",
          input: { emailAddress: "worker@example.com", replyTo: null },
        },
        { name: "rejects a non-object", input: "EMAIL" },
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
          input: EMAIL_NOTIFICATION,
          expected: EMAIL_NOTIFICATION,
        },
        {
          name: "accepts a later known variant",
          input: SMS_NOTIFICATION,
          expected: SMS_NOTIFICATION,
        },
        {
          name: "strips an unknown key from a known variant",
          input: { ...EMAIL_NOTIFICATION, unknownKey: "value" },
          expected: EMAIL_NOTIFICATION,
        },
        {
          name: "collapses an unknown discriminator to the fallback",
          input: { channel: "PUSH", deviceToken: "abc123" },
          expected: { channel: ENUM_FALLBACK },
        },
        {
          name: "collapses an unknown discriminator carrying no other fields",
          input: { channel: "PUSH" },
          expected: { channel: ENUM_FALLBACK },
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
          input: { channel: "EMAIL", emailAddress: "worker@example.com" },
        },
        {
          name: "rejects an invalid value on a known variant",
          input: { ...EMAIL_NOTIFICATION, emailAddress: 3 },
        },
        {
          name: "rejects a missing discriminator",
          input: { emailAddress: "worker@example.com", replyTo: null },
        },
        { name: "rejects a non-string discriminator", input: { channel: 1 } },
        { name: "rejects a non-object", input: "EMAIL" },
      ])("$name", ({ input }) => {
        const actual = response.safeParse(input);

        expectToBeSafeParseError(actual);
      });

      it("reports the offending field rather than an opaque union error", () => {
        const actual = response.safeParse({ ...EMAIL_NOTIFICATION, emailAddress: 3 });

        expectToBeSafeParseError(actual);
        expect(actual.error.issues).toHaveLength(1);
        expect(actual.error.issues[0]?.path).toStrictEqual(["emailAddress"]);
      });
    });
  });

  describe("variant composition", () => {
    const base = z.object({ messageId: z.string() });
    const DELIVERY_STATUSES = ["SENT", "BOUNCED"] as const;

    const composed = discriminatedUnionWithFallback("status", DELIVERY_STATUSES, {
      SENT: base.extend({
        status: z.literal("SENT"),
        sentAt: z.string(),
      }),
      BOUNCED: base.extend({ status: z.literal("BOUNCED"), reason: z.string() }).strict(),
    });

    it("accepts a variant extended from a shared base", () => {
      const actual = composed.request.safeParse({
        status: "SENT",
        messageId: "1",
        sentAt: "2026-03-15T10:30:00.000Z",
      });

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toStrictEqual({
        status: "SENT",
        messageId: "1",
        sentAt: "2026-03-15T10:30:00.000Z",
      });
    });

    it("strips unknown keys on the response even when the caller passed a strict variant", () => {
      const actual = composed.response.safeParse({
        status: "BOUNCED",
        messageId: "1",
        reason: "MAILBOX_FULL",
        unknownKey: "value",
      });

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toStrictEqual({
        status: "BOUNCED",
        messageId: "1",
        reason: "MAILBOX_FULL",
      });
    });

    it("collapses an unknown discriminator under a custom discriminator key", () => {
      const actual = composed.response.safeParse({ status: "THROTTLED", retryAfterSeconds: 30 });

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toStrictEqual({ status: ENUM_FALLBACK });
    });
  });

  describe("inferred types", () => {
    it("narrows request to the known variants", () => {
      const notification: z.infer<typeof request> = EMAIL_NOTIFICATION;
      // @ts-expect-error -- requests carry no fallback variant.
      const fallback: z.infer<typeof request> = { channel: ENUM_FALLBACK };
      // @ts-expect-error -- a variant's own fields stay required.
      const partial: z.infer<typeof request> = { channel: "EMAIL" };

      expect([notification, fallback, partial]).toHaveLength(3);
    });

    it("widens response to the known variants plus the fallback", () => {
      const notification: z.infer<typeof response> = SMS_NOTIFICATION;
      const fallback: z.infer<typeof response> = { channel: ENUM_FALLBACK };
      // @ts-expect-error -- the fallback variant carries the discriminator alone.
      const unknownVariant: z.infer<typeof response> = { channel: "PUSH", deviceToken: "abc123" };

      expect([notification, fallback, unknownVariant]).toHaveLength(3);
    });
  });

  describe("misuse", () => {
    it("rejects values including the fallback sentinel", () => {
      expect(() =>
        // @ts-expect-error -- the fallback sentinel is never a discriminator value.
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
