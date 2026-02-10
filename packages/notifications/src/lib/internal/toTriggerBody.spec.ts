import type { TriggerBody } from "../types";
import { toTriggerBody } from "./toTriggerBody";

describe("toTriggerBody", () => {
  it("includes tenant when workplaceId is provided", () => {
    const input: TriggerBody = {
      recipients: [{ userId: "user-1" }],
      workplaceId: "workplace-123",
    };
    const expected = {
      recipients: [{ id: "user-1" }],
      tenant: "workplace-123",
    };

    const actual = toTriggerBody(input);

    expect(actual).toEqual(expected);
  });

  it("excludes tenant when workplaceId is not provided", () => {
    const input: TriggerBody = {
      recipients: [{ userId: "user-1" }],
    };
    const expected = {
      recipients: [{ id: "user-1" }],
    };

    const actual = toTriggerBody(input);

    expect(actual).toEqual(expected);
  });

  it("handles string recipients", () => {
    const input: TriggerBody = {
      recipients: ["user-1", "user-2"],
    };
    const expected = {
      recipients: ["user-1", "user-2"],
    };

    const actual = toTriggerBody(input);

    expect(actual).toEqual(expected);
  });

  it("handles mixed recipient types", () => {
    const input: TriggerBody = {
      recipients: [
        "user-1",
        { userId: "user-2", email: "test@example.com", customProperties: { stage: "ENROLLED" } },
      ],
    };
    const expected = {
      recipients: ["user-1", { id: "user-2", email: "test@example.com", stage: "ENROLLED" }],
    };

    const actual = toTriggerBody(input);

    expect(actual).toEqual(expected);
  });

  it("maps recipient triggerData to trigger_data", () => {
    const input: TriggerBody = {
      recipients: [{ userId: "user-1", triggerData: { shiftId: "shift-1" } }],
    };
    const expected = {
      recipients: [{ id: "user-1", $trigger_data: { shiftId: "shift-1" } }],
    };

    const actual = toTriggerBody(input);

    expect(actual).toEqual(expected);
  });

  it("maps attachments into data payload with snake_case keys", () => {
    const input: TriggerBody = {
      recipients: ["user-1"],
      attachments: [
        {
          name: "report.pdf",
          contentType: "application/pdf",
          content: "base64data",
        },
      ],
    };
    const expected = {
      recipients: ["user-1"],
      data: {
        attachments: [
          {
            name: "report.pdf",
            content_type: "application/pdf",
            content: "base64data",
          },
        ],
      },
    };

    const actual = toTriggerBody(input);

    expect(actual).toEqual(expected);
  });

  it("merges attachments with existing data", () => {
    const input: TriggerBody = {
      recipients: ["user-1"],
      data: { message: "Hello" },
      attachments: [
        {
          name: "image.png",
          contentType: "image/png",
          content: "base64data",
        },
      ],
    };
    const expected = {
      recipients: ["user-1"],
      data: {
        message: "Hello",
        attachments: [
          {
            name: "image.png",
            content_type: "image/png",
            content: "base64data",
          },
        ],
      },
    };

    const actual = toTriggerBody(input);

    expect(actual).toEqual(expected);
  });

  it("excludes attachments from data when not provided", () => {
    const input: TriggerBody = {
      recipients: ["user-1"],
      data: { message: "Hello" },
    };
    const expected = {
      recipients: ["user-1"],
      data: { message: "Hello" },
    };

    const actual = toTriggerBody(input);

    expect(actual).toEqual(expected);
  });

  it("excludes data key entirely when neither data nor attachments provided", () => {
    const input: TriggerBody = {
      recipients: ["user-1"],
    };
    const expected = {
      recipients: ["user-1"],
    };

    const actual = toTriggerBody(input);

    expect(actual).toEqual(expected);
    expect(actual).not.toHaveProperty("data");
  });

  it("maps multiple attachments", () => {
    const input: TriggerBody = {
      recipients: ["user-1"],
      attachments: [
        {
          name: "report.pdf",
          contentType: "application/pdf",
          content: "base64pdf",
        },
        {
          name: "logo.png",
          contentType: "image/png",
          content: "base64png",
        },
        {
          name: "invite.ics",
          contentType: "text/calendar",
          content: "base64ics",
        },
      ],
    };
    const expected = {
      recipients: ["user-1"],
      data: {
        attachments: [
          {
            name: "report.pdf",
            content_type: "application/pdf",
            content: "base64pdf",
          },
          {
            name: "logo.png",
            content_type: "image/png",
            content: "base64png",
          },
          {
            name: "invite.ics",
            content_type: "text/calendar",
            content: "base64ics",
          },
        ],
      },
    };

    const actual = toTriggerBody(input);

    expect(actual).toEqual(expected);
  });
});
