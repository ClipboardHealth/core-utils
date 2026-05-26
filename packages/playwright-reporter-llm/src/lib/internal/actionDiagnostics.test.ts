import { ActionBuilder } from "./actionDiagnostics";
import { ACTION_LOG_MESSAGE_CAP, ACTION_LOG_MESSAGES_CAP, TRUNCATION_MARKER } from "./constants";

describe(ActionBuilder, () => {
  it("builds a failing action from before, log, and after events", () => {
    const builder = new ActionBuilder();

    builder.admit({
      type: "before",
      callId: "call@1",
      class: "Frame",
      method: "click",
      params: { selector: "internal:role=button[name='Submit']" },
      startTime: 10,
    });
    builder.admit({
      type: "log",
      callId: "call@1",
      message: "\u001B[31m  locator resolved to visible <button>Submit</button>\u001B[39m",
    });
    builder.admit({
      type: "after",
      callId: "call@1",
      endTime: 25,
      error: { message: "Element is not attached to the DOM" },
    });

    const actual = builder.findFailingAction();

    expect(actual).toStrictEqual({
      callId: "call@1",
      apiName: "Frame.click",
      selector: "internal:role=button[name='Submit']",
      log: ["  locator resolved to visible <button>Submit</button>"],
      error: "Element is not attached to the DOM",
      startTime: 10,
      endTime: 25,
    });
  });

  it("picks the action with an error instead of the last completed action", () => {
    const builder = new ActionBuilder();

    builder.admit({ type: "before", callId: "call@1", class: "Frame", method: "click" });
    builder.admit({ type: "after", callId: "call@1", endTime: 10, error: "click failed" });
    builder.admit({ type: "before", callId: "call@2", class: "Frame", method: "fill" });
    builder.admit({ type: "after", callId: "call@2", endTime: 20 });

    const actual = builder.findFailingAction();

    expect(actual?.callId).toBe("call@1");
    expect(actual?.error).toBe("click failed");
  });

  it("picks the last failing action when multiple actions fail", () => {
    const builder = new ActionBuilder();

    builder.admit({ type: "before", callId: "call@1", class: "Frame", method: "click" });
    builder.admit({ type: "after", callId: "call@1", endTime: 10, error: "click failed" });
    builder.admit({ type: "before", callId: "call@2", class: "Frame", method: "fill" });
    builder.admit({ type: "after", callId: "call@2", endTime: 20, error: "fill failed" });

    const actual = builder.findFailingAction();

    expect(actual?.callId).toBe("call@2");
    expect(actual?.error).toBe("fill failed");
  });

  it("keeps the earliest start time for duplicate start events", () => {
    const builder = new ActionBuilder();

    builder.admit({
      type: "before",
      callId: "call@1",
      class: "Frame",
      method: "click",
      startTime: 10,
    });
    builder.admit({
      type: "action",
      callId: "call@1",
      class: "Frame",
      method: "click",
      startTime: 20,
    });
    builder.admit({ type: "after", callId: "call@1", endTime: 30, error: "click failed" });

    const actual = builder.findFailingAction();

    expect(actual?.startTime).toBe(10);
  });

  it("returns the last completed action when no action has an error", () => {
    const builder = new ActionBuilder();

    builder.admit({ type: "before", callId: "call@1", class: "Frame", method: "click" });
    builder.admit({ type: "after", callId: "call@1", endTime: 10 });
    builder.admit({ type: "before", callId: "call@2", class: "Frame", method: "fill" });
    builder.admit({ type: "after", callId: "call@2", endTime: 20 });

    const actual = builder.findFailingAction();

    expect(actual?.callId).toBe("call@2");
  });

  it("retains only a compact action log with an omission marker", () => {
    const builder = new ActionBuilder();

    builder.admit({ type: "before", callId: "call@1", class: "Frame", method: "click" });
    for (let index = 0; index < 30; index += 1) {
      builder.admit({ type: "log", callId: "call@1", message: `log-${index}` });
    }
    builder.admit({ type: "after", callId: "call@1", endTime: 30, error: "click failed" });

    const actual = builder.findFailingAction();

    expect(actual?.log).toHaveLength(ACTION_LOG_MESSAGES_CAP);
    expect(actual?.log.slice(0, 5)).toStrictEqual(["log-0", "log-1", "log-2", "log-3", "log-4"]);
    expect(actual?.log[5]).toContain("omitted");
    expect(actual?.log.at(-1)).toBe("log-29");
  });

  it("caps individual action log messages", () => {
    const builder = new ActionBuilder();
    const longMessage = "x".repeat(ACTION_LOG_MESSAGE_CAP + 50);

    builder.admit({ type: "before", callId: "call@1", class: "Frame", method: "click" });
    builder.admit({ type: "log", callId: "call@1", message: longMessage });
    builder.admit({ type: "after", callId: "call@1", endTime: 10, error: "click failed" });

    const actual = builder.findFailingAction();

    expect(actual?.log[0]?.length).toBe(ACTION_LOG_MESSAGE_CAP);
    expect(actual?.log[0]?.endsWith(TRUNCATION_MARKER)).toBe(true);
  });
});
