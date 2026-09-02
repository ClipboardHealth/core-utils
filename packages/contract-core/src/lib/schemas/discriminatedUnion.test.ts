import {
  expectToBeSafeParseError,
  expectToBeSafeParseSuccess,
} from "@clipboard-health/testing-core";
import { z } from "zod";

import { discriminatedUnionWithFallback } from "./discriminatedUnion";
import { ENUM_FALLBACK } from "./enum";

const { request, response } = discriminatedUnionWithFallback("channel", [
  z.object({
    channel: z.literal("EMAIL"),
    emailAddress: z.string().email(),
    replyTo: z.string().email().nullable(),
  }),
  z.object({
    channel: z.literal("SMS"),
    phoneNumber: z.string(),
  }),
]);

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

    const composed = discriminatedUnionWithFallback("status", [
      base.extend({
        status: z.literal("SENT"),
        sentAt: z.string(),
      }),
      base.extend({ status: z.literal("BOUNCED"), reason: z.string() }).strict(),
    ]);

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

      // Trivial assertion; the @ts-expect-error directives above are the test.
      expect([notification, fallback, partial]).toHaveLength(3);
    });

    it("widens response to the known variants plus the fallback", () => {
      const notification: z.infer<typeof response> = SMS_NOTIFICATION;
      const fallback: z.infer<typeof response> = { channel: ENUM_FALLBACK };
      // @ts-expect-error -- the fallback variant carries the discriminator alone.
      const unknownVariant: z.infer<typeof response> = { channel: "PUSH", deviceToken: "abc123" };

      // Trivial assertion; the @ts-expect-error directives above are the test.
      expect([notification, fallback, unknownVariant]).toHaveLength(3);
    });
  });

  describe("misuse", () => {
    it("rejects a variant claiming the fallback sentinel", () => {
      expect(() =>
        discriminatedUnionWithFallback("channel", [
          z.object({ channel: z.literal(ENUM_FALLBACK) }),
        ]),
      ).toThrow(`Variant discriminators must not include "${ENUM_FALLBACK}"`);
    });

    it("rejects a variant omitting the discriminator", () => {
      expect(() =>
        // @ts-expect-error -- every variant must declare the discriminator.
        discriminatedUnionWithFallback("channel", [z.object({ emailAddress: z.string() })]),
      ).toThrow('Variant at index 0 must declare channel: z.literal("<value>") in its shape.');
    });

    it("rejects a non-literal discriminator", () => {
      expect(() =>
        // @ts-expect-error -- the discriminator must be a literal, not a plain string.
        discriminatedUnionWithFallback("channel", [z.object({ channel: z.string() })]),
      ).toThrow('Variant at index 0 must declare channel: z.literal("<value>") in its shape.');
    });

    it("rejects a duplicated discriminator value", () => {
      expect(() =>
        discriminatedUnionWithFallback("channel", [
          z.object({ channel: z.literal("EMAIL"), emailAddress: z.string() }),
          z.object({ channel: z.literal("EMAIL"), replyTo: z.string() }),
        ]),
      ).toThrow("Discriminator property channel has duplicate value EMAIL");
    });
  });
});
