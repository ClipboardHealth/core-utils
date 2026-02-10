import type { TriggerBody } from "../types";
import { toTriggerBody } from "./toTriggerBody";

describe("toTriggerBody", () => {
  it("includes tenant when workplaceId is provided", () => {
    const input: TriggerBody = {
      recipients: [{ userId: "user-1" }],
      workplaceId: "workplace-123",
    };

    const result = toTriggerBody(input);

    expect(result).toEqual({
      recipients: [{ id: "user-1" }],
      tenant: "workplace-123",
    });
  });

  it("excludes tenant when workplaceId is not provided", () => {
    const input: TriggerBody = {
      recipients: [{ userId: "user-1" }],
    };

    const result = toTriggerBody(input);

    expect(result).toEqual({
      recipients: [{ id: "user-1" }],
    });
  });

  it("handles string recipients", () => {
    const input: TriggerBody = {
      recipients: ["user-1", "user-2"],
    };

    const result = toTriggerBody(input);

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

    const result = toTriggerBody(input);

    expect(result).toEqual({
      recipients: ["user-1", { id: "user-2", email: "test@example.com", stage: "ENROLLED" }],
    });
  });

  it("maps recipient triggerData to trigger_data", () => {
    const input: TriggerBody = {
      recipients: [{ userId: "user-1", triggerData: { shiftId: "shift-1" } }],
    };

    const result = toTriggerBody(input);

    expect(result).toEqual({
      recipients: [{ id: "user-1", $trigger_data: { shiftId: "shift-1" } }],
    });
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

    const result = toTriggerBody(input);

    expect(result).toEqual({
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
    });
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
          contentId: "cid-123",
          disposition: "inline",
        },
      ],
    };

    const result = toTriggerBody(input);

    expect(result).toEqual({
      recipients: ["user-1"],
      data: {
        message: "Hello",
        attachments: [
          {
            name: "image.png",
            content_type: "image/png",
            content: "base64data",
            content_id: "cid-123",
            disposition: "inline",
          },
        ],
      },
    });
  });

  it("excludes attachments from data when not provided", () => {
    const input: TriggerBody = {
      recipients: ["user-1"],
      data: { message: "Hello" },
    };

    const result = toTriggerBody(input);

    expect(result).toEqual({
      recipients: ["user-1"],
      data: { message: "Hello" },
    });
  });

  it("excludes data key entirely when neither data nor attachments provided", () => {
    const input: TriggerBody = {
      recipients: ["user-1"],
    };

    const result = toTriggerBody(input);

    expect(result).toEqual({
      recipients: ["user-1"],
    });
    expect(result).not.toHaveProperty("data");
  });

  it("maps multiple attachments with optional fields", () => {
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
          contentId: "logo-cid",
          disposition: "inline",
        },
        {
          name: "invite.ics",
          contentType: "text/calendar",
          content: "base64ics",
          disposition: "inline",
        },
      ],
    };

    const result = toTriggerBody(input);

    expect(result).toEqual({
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
            content_id: "logo-cid",
            disposition: "inline",
          },
          {
            name: "invite.ics",
            content_type: "text/calendar",
            content: "base64ics",
            disposition: "inline",
          },
        ],
      },
    });
  });
});
