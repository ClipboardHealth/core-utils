import { describe, expect, it } from "vitest";

import { CbhError } from "../errors/cbhError";
import { toErrorCbhResponse, toSuccessCbhResponse } from "./cbhResponse";

describe(toErrorCbhResponse, () => {
  it("returns error", () => {
    const message = "boom";

    const response = toErrorCbhResponse({ message });

    expect(response).toStrictEqual({
      success: false,
      error: new CbhError({ message }),
    });
  });
});

describe(toSuccessCbhResponse, () => {
  it("returns success", () => {
    const message = "success";

    const response = toSuccessCbhResponse({ message });

    expect(response).toStrictEqual({ success: true, data: { message } });
  });
});
