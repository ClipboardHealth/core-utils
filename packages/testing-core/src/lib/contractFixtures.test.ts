import { z } from "zod";

import { buildContractFixture, createContractFixtureBuilder } from "./contractFixtures";

const responseSchema = z.object({
  createdAt: z.string().transform((value) => new Date(value)),
  data: z.object({ id: z.string().min(1), count: z.number() }),
});

describe("contract fixtures", () => {
  it("builds one-shot fixtures from schema input to schema output", () => {
    const actual = buildContractFixture({
      schema: responseSchema,
      fixture: {
        createdAt: "2026-08-13T12:00:00.000Z",
        data: { id: "fixture-id", count: 1 },
      },
    });

    expect(actual).toEqual({
      createdAt: new Date("2026-08-13T12:00:00.000Z"),
      data: { id: "fixture-id", count: 1 },
    });
  });

  it("builds reusable fixture families with shallow overrides", () => {
    const buildResponse = createContractFixtureBuilder({
      schema: responseSchema,
      defaults: {
        createdAt: "2026-08-13T12:00:00.000Z",
        data: { id: "default-id", count: 1 },
      },
    });

    expect(buildResponse({ data: { id: "override-id", count: 2 } })).toEqual({
      createdAt: new Date("2026-08-13T12:00:00.000Z"),
      data: { id: "override-id", count: 2 },
    });
  });

  it("throws a ZodError when a fixture drifts", () => {
    expect(() =>
      buildContractFixture({
        schema: responseSchema,
        fixture: {
          createdAt: "2026-08-13T12:00:00.000Z",
          data: {
            id: "fixture-id",
            // @ts-expect-error Deliberately prove runtime parsing rejects untyped drift.
            count: "not-a-number",
          },
        },
      }),
    ).toThrow(z.ZodError);
  });
});
