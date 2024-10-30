import { deepEqual, equal } from "node:assert/strict";

import { ERROR_CODES, ServiceError } from "@clipboard-health/util-typescript";

{
  const error = new ServiceError("boom");
  equal(error.toString(), `ServiceError[${error.id}]: [internal]: boom`);
}

{
  const errorWithCause = new ServiceError({
    issues: [{ message: "boom" }],
    cause: new Error("Original error"),
  });
  equal(
    errorWithCause.toString(),
    `ServiceError[${errorWithCause.id}]: [internal]: boom; [cause]: Error: Original error`,
  );
}

{
  const multipleIssues = new ServiceError({
    issues: [
      {
        code: ERROR_CODES.badRequest,
        message: "Invalid email format",
        path: ["data", "attributes", "email"],
      },
      {
        code: ERROR_CODES.unprocessableEntity,
        message: "Phone number too short",
        path: ["data", "attributes", "phoneNumber"],
      },
    ],
    cause: new Error("Original error"),
  });

  equal(
    multipleIssues.toString(),
    `ServiceError[${multipleIssues.id}]: [badRequest]: Invalid email format; [unprocessableEntity]: Phone number too short; [cause]: Error: Original error`,
  );

  deepEqual(multipleIssues.toJsonApi(), {
    errors: [
      {
        id: multipleIssues.id,
        status: "400",
        code: "badRequest",
        title: "Invalid or malformed request",
        detail: "Invalid email format",
        source: {
          pointer: "/data/attributes/email",
        },
      },
      {
        id: multipleIssues.id,
        status: "422",
        code: "unprocessableEntity",
        title: "Request failed validation",
        detail: "Phone number too short",
        source: {
          pointer: "/data/attributes/phoneNumber",
        },
      },
    ],
  });
}
