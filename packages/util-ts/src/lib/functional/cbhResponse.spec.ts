/* eslint-disable sonarjs/deprecation */
import { CbhError } from "../errors/cbhError";
import { toErrorCbhResponse, toSuccessCbhResponse } from "./cbhResponse";

describe("toErrorCbhResponse", () => {
  it("returns error", () => {
    const message = "boom";

    const response = toErrorCbhResponse({ message });

    expect(response).toEqual({
      success: false,
      error: new CbhError({ message }),
    });
  });
});

describe("toSuccessCbhResponse", () => {
  it("returns success", () => {
    const message = "success";

    const response = toSuccessCbhResponse({ message });

    expect(response).toEqual({ success: true, data: { message } });
  });
});
/* eslint-enable sonarjs/deprecation */
