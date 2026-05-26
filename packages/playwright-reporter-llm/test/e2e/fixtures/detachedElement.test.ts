import { mkdirSync } from "node:fs";
import path from "node:path";

import { test } from "@playwright/test";

import { writeTraceZipFixture } from "../../../src/lib/internal/testHelpers";

// eslint-disable-next-line no-empty-pattern
test("captures action log when element detaches before click", async ({}, testInfo) => {
  const tracePath = testInfo.outputPath("trace.zip");
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  mkdirSync(path.dirname(tracePath), { recursive: true });
  writeTraceZipFixture(path.dirname(tracePath), path.basename(tracePath), {
    requestBody: JSON.stringify({ request: "unused" }),
    responseBody: JSON.stringify({ response: "unused" }),
    networkEvents: [],
    traceEvents: [
      {
        type: "before",
        callId: "call@detached",
        class: "Frame",
        method: "click",
        params: { selector: "internal:role=button[name='Submit']" },
      },
      {
        type: "log",
        callId: "call@detached",
        message: "  locator resolved to visible <button>Submit</button>",
      },
      {
        type: "log",
        callId: "call@detached",
        message: "element was detached from the DOM, retrying",
      },
      {
        type: "after",
        callId: "call@detached",
        endTime: 37,
        error: { message: "Element is not attached to the DOM" },
      },
    ],
  });
  await testInfo.attach("trace", { path: tracePath, contentType: "application/zip" });

  throw new Error("element was detached from the DOM");
});
