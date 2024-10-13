import { z } from "zod";

import { expectToBeError, expectToBeSuccess } from "../../test";
import { createFields } from "./createFields";

describe("createFields", () => {
  const fieldsSchema = z.object(
    createFields({
      user: ["name", "email"],
      post: ["title"],
    }),
  );

  it("accepts valid fields", () => {
    const input = {
      fields: {
        user: ["name", "email"],
        post: ["title"],
      },
    };

    const actual = fieldsSchema.safeParse(input);

    expectToBeSuccess(actual);
  });

  it("rejects invalid fields", () => {
    const input = {
      fields: {
        user: ["name", "invalid"],
        post: ["content"],
      },
    };

    const actual = fieldsSchema.safeParse(input);

    expectToBeError(actual);
    expect(actual.error.message).toContain(
      "Invalid enum value. Expected 'name' | 'email', received 'invalid'",
    );
  });

  it("rejects unknown API type", () => {
    const input = {
      fields: {
        invalid: ["field"],
      },
    };

    const actual = fieldsSchema.safeParse(input);

    expectToBeError(actual);
    expect(actual.error.message).toContain("Unrecognized key(s) in object: 'invalid'");
  });

  it("allows omitting fields and API types", () => {
    const input = {
      fields: {
        user: ["name"],
      },
    };

    const actual = fieldsSchema.safeParse(input);

    expectToBeSuccess(actual);
  });

  it("parses comma-separated string input", () => {
    const input = {
      fields: {
        user: "name,email",
        post: "title",
      },
    };

    const actual = fieldsSchema.safeParse(input);

    expectToBeSuccess(actual);
    expect(actual.data).toEqual({
      fields: {
        user: ["name", "email"],
        post: ["title"],
      },
    });
  });

  it("rejects empty array for fields", () => {
    const input = {
      fields: {
        user: [],
      },
    };

    const actual = fieldsSchema.safeParse(input);

    expectToBeError(actual);
    expect(actual.error.message).toContain("Array must contain at least 1 element(s)");
  });

  it("allows empty object", () => {
    const actual = fieldsSchema.safeParse({});

    expectToBeSuccess(actual);
  });
});
