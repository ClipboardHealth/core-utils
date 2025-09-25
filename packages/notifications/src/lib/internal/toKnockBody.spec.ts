import type { TriggerBody } from "../types";
import { toKnockBody } from "./toKnockBody";

describe("toKnockBody", () => {
  it("includes tenant when workplaceId is provided", () => {
    const input: TriggerBody = {
      recipients: [{ userId: "user-1" }],
      workplaceId: "workplace-123",
    };

    const result = toKnockBody(input);

    expect(result).toEqual({
      recipients: [{ id: "user-1" }],
      tenant: "workplace-123",
    });
  });

  it("excludes tenant when workplaceId is not provided", () => {
    const input: TriggerBody = {
      recipients: [{ userId: "user-1" }],
    };

    const result = toKnockBody(input);

    expect(result).toEqual({
      recipients: [{ id: "user-1" }],
    });
  });

  it("handles string recipients", () => {
    const input: TriggerBody = {
      recipients: ["user-1", "user-2"],
    };

    const result = toKnockBody(input);

    expect(result).toEqual({
      recipients: ["user-1", "user-2"],
    });
  });

  it("handles mixed recipient types", () => {
    const input: TriggerBody = {
      recipients: [
        "user-1",
        { userId: "user-2", email: "test@example.com", customProperties: { stage: "ENROLLED" } },
      ],
    };

    const result = toKnockBody(input);

    expect(result).toEqual({
      recipients: ["user-1", { id: "user-2", email: "test@example.com", stage: "ENROLLED" }],
    });
  });
});
