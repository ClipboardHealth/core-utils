import {
  expectToBeSafeParseError,
  expectToBeSafeParseSuccess,
} from "@clipboard-health/testing-core";
import { z } from "zod";

import { commaSeparatedArray } from "./commaSeparatedArray";
import { dateTimeSchema } from "./dateTime";
import {
  ENUM_FALLBACK,
  optionalEnum,
  optionalEnumWithFallback,
  requiredEnum,
  requiredEnumWithFallback,
} from "./enum";
import { nonEmptyString } from "./nonEmptyString";
import { objectId } from "./objectId";

const WORKER_TYPES = ["CNA", "RN", "LVN"] as const;
const VALID_OBJECT_ID = "507f1f77bcf86cd799439011";
const VALID_OBJECT_ID_2 = "507f1f77bcf86cd799439012";

describe(commaSeparatedArray, () => {
  describe("with nonEmptyString", () => {
    const schema = commaSeparatedArray(nonEmptyString);

    describe("success cases", () => {
      it.each<{ expected: string[]; input: unknown; name: string }>([
        {
          name: "splits comma-separated string into array",
          input: "CNA,RN,LVN",
          expected: ["CNA", "RN", "LVN"],
        },
        {
          name: "handles single-value string",
          input: "CNA",
          expected: ["CNA"],
        },
        {
          name: "passes through array unchanged",
          input: ["CNA", "RN"],
          expected: ["CNA", "RN"],
        },
        {
          name: "handles single-element array",
          input: ["CNA"],
          expected: ["CNA"],
        },
      ])("$name", ({ input, expected }) => {
        const actual = schema.safeParse(input);

        expectToBeSafeParseSuccess(actual);
        expect(actual.data).toStrictEqual(expected);
      });
    });

    describe("error cases", () => {
      it.each<{ input: unknown; name: string }>([
        { name: "rejects empty string items after split", input: "CNA,,RN" },
        { name: "rejects number", input: 42 },
        { name: "rejects undefined", input: undefined },
        { name: "rejects null", input: null },
        { name: "rejects object", input: {} },
        { name: "rejects array with invalid items", input: [42, true] },
      ])("$name", ({ input }) => {
        const actual = schema.safeParse(input);

        expectToBeSafeParseError(actual);
      });
    });
  });

  describe("with objectId", () => {
    const schema = commaSeparatedArray(objectId);

    it("splits comma-separated ObjectIds", () => {
      const input = `${VALID_OBJECT_ID},${VALID_OBJECT_ID_2}`;

      const actual = schema.safeParse(input);

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toStrictEqual([VALID_OBJECT_ID, VALID_OBJECT_ID_2]);
    });

    it("passes through ObjectId array", () => {
      const input = [VALID_OBJECT_ID, VALID_OBJECT_ID_2];

      const actual = schema.safeParse(input);

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toStrictEqual([VALID_OBJECT_ID, VALID_OBJECT_ID_2]);
    });

    it("rejects invalid ObjectIds in comma-separated string", () => {
      const actual = schema.safeParse(`${VALID_OBJECT_ID},not-an-id`);

      expectToBeSafeParseError(actual);
    });

    it("rejects invalid ObjectIds in array", () => {
      const actual = schema.safeParse([VALID_OBJECT_ID, "not-an-id"]);

      expectToBeSafeParseError(actual);
    });
  });

  describe("with requiredEnum", () => {
    const schema = commaSeparatedArray(requiredEnum([...WORKER_TYPES]));

    it("splits comma-separated enum values", () => {
      const actual = schema.safeParse("CNA,RN");

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toStrictEqual(["CNA", "RN"]);
    });

    it("passes through enum array", () => {
      const actual = schema.safeParse(["CNA", "LVN"]);

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toStrictEqual(["CNA", "LVN"]);
    });

    it("rejects invalid enum value in comma-separated string", () => {
      const actual = schema.safeParse("CNA,INVALID");

      expectToBeSafeParseError(actual);
    });

    it("rejects invalid enum value in array", () => {
      const actual = schema.safeParse(["CNA", "INVALID"]);

      expectToBeSafeParseError(actual);
    });
  });

  describe("with optionalEnum", () => {
    const schema = commaSeparatedArray(optionalEnum([...WORKER_TYPES]));

    it("splits comma-separated enum values", () => {
      const actual = schema.safeParse("CNA,RN");

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toStrictEqual(["CNA", "RN"]);
    });

    it("passes through enum array", () => {
      const actual = schema.safeParse(["CNA", "LVN"]);

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toStrictEqual(["CNA", "LVN"]);
    });

    it("rejects invalid enum value in comma-separated string", () => {
      const actual = schema.safeParse("CNA,INVALID");

      expectToBeSafeParseError(actual);
    });
  });

  describe("with requiredEnumWithFallback", () => {
    const schema = commaSeparatedArray(requiredEnumWithFallback([...WORKER_TYPES]));

    it("splits comma-separated enum values", () => {
      const actual = schema.safeParse("CNA,RN");

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toStrictEqual(["CNA", "RN"]);
    });

    it("coerces unrecognized values to ENUM_FALLBACK", () => {
      const actual = schema.safeParse("CNA,UNKNOWN");

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toStrictEqual(["CNA", ENUM_FALLBACK]);
    });

    it("passes through enum array", () => {
      const actual = schema.safeParse(["CNA", "LVN"]);

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toStrictEqual(["CNA", "LVN"]);
    });

    it("coerces unrecognized values in array to ENUM_FALLBACK", () => {
      const actual = schema.safeParse(["CNA", "UNKNOWN"]);

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toStrictEqual(["CNA", ENUM_FALLBACK]);
    });
  });

  describe("with optionalEnumWithFallback", () => {
    const schema = commaSeparatedArray(optionalEnumWithFallback([...WORKER_TYPES]));

    it("splits comma-separated enum values", () => {
      const actual = schema.safeParse("CNA,RN");

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toStrictEqual(["CNA", "RN"]);
    });

    it("coerces unrecognized values to ENUM_FALLBACK", () => {
      const actual = schema.safeParse("CNA,UNKNOWN");

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toStrictEqual(["CNA", ENUM_FALLBACK]);
    });

    it("passes through enum array", () => {
      const actual = schema.safeParse(["CNA", "LVN"]);

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toStrictEqual(["CNA", "LVN"]);
    });
  });

  describe("with dateTimeSchema()", () => {
    const schema = commaSeparatedArray(dateTimeSchema());

    it("splits comma-separated datetime strings", () => {
      const input = "2026-01-01T00:00:00.000Z,2026-01-02T00:00:00.000Z";

      const actual = schema.safeParse(input);

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toHaveLength(2);
      expect(actual.data[0]).toBeInstanceOf(Date);
      expect(actual.data[1]).toBeInstanceOf(Date);
      expect(actual.data[0]?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
      expect(actual.data[1]?.toISOString()).toBe("2026-01-02T00:00:00.000Z");
    });

    it("passes through Date array", () => {
      const input = [new Date("2026-01-01T00:00:00.000Z"), new Date("2026-01-02T00:00:00.000Z")];

      const actual = schema.safeParse(input);

      expectToBeSafeParseSuccess(actual);
      expect(actual.data).toHaveLength(2);
      expect(actual.data[0]?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
      expect(actual.data[1]?.toISOString()).toBe("2026-01-02T00:00:00.000Z");
    });

    it("rejects invalid datetime in comma-separated string", () => {
      const actual = schema.safeParse("not-a-date,2026-01-01T00:00:00.000Z");

      expectToBeSafeParseError(actual);
    });
  });

  describe("composability", () => {
    it("composes with .optional()", () => {
      const schema = commaSeparatedArray(nonEmptyString).optional();

      // eslint-disable-next-line unicorn/no-useless-undefined
      const undef = schema.safeParse(undefined);
      expectToBeSafeParseSuccess(undef);
      expect(undef.data).toBeUndefined();

      const valid = schema.safeParse("a,b");
      expectToBeSafeParseSuccess(valid);
      expect(valid.data).toStrictEqual(["a", "b"]);
    });
  });

  describe("error cases", () => {
    const schema = commaSeparatedArray(z.string());

    it.each<{ input: unknown; name: string }>([
      { name: "rejects number", input: 42 },
      { name: "rejects boolean", input: true },
      { name: "rejects undefined", input: undefined },
      { name: "rejects null", input: null },
      { name: "rejects object", input: {} },
    ])("$name", ({ input }) => {
      const actual = schema.safeParse(input);

      expectToBeSafeParseError(actual);
    });
  });
});
