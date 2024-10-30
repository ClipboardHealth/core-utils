import { deepEqual } from "node:assert/strict";

import { ERROR_CODES, ServiceError } from "@clipboard-health/util-typescript";

const error = new ServiceError({
  issues: [
    {
      code: ERROR_CODES.badRequest,
      detail: "Invalid email format",
      path: ["data", "attributes", "email"],
    },
    {
      code: ERROR_CODES.unprocessableContent,
      detail: "Phone number too short",
      path: ["data", "attributes", "phoneNumber"],
    },
  ],
  cause: new Error("Validation failed"),
});

deepEqual(
  error.toString(),
  `ServiceError[${error.id}]: [badRequest]: Invalid email format; [unprocessableContent]: Phone number too short; [cause]: Error: Validation failed`,
);

deepEqual(error.toJsonApi(), {
  errors: [
    {
      id: error.id,
      status: "400",
      code: "badRequest",
      title: "Invalid or malformed request",
      detail: "Invalid email format",
      source: {
        pointer: "/data/attributes/email",
      },
    },
    {
      id: error.id,
      status: "422",
      code: "unprocessableContent",
      title: "Request failed validation",
      detail: "Phone number too short",
      source: {
        pointer: "/data/attributes/phoneNumber",
      },
    },
  ],
});
