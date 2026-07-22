// embedex: packages/util-ts/src/lib/functional/matchServiceResult.ts,packages/util-ts/README.md
import { strictEqual } from "node:assert/strict";

import {
  failure,
  matchServiceResult,
  ServiceError,
  type ServiceResult,
  success,
} from "@clipboard-health/util-ts";

interface User {
  id: string;
  name: string;
}

class InvalidUserIdError extends ServiceError {
  public readonly _tag = "InvalidUserIdError" as const;

  public constructor() {
    super("User ID is required");
  }
}

class UserNotFoundError extends ServiceError {
  public readonly _tag = "UserNotFoundError" as const;

  public readonly userId: string;

  public constructor({ userId }: { userId: string }) {
    super(`User ${userId} was not found`);
    this.userId = userId;
  }
}

type FindUserError = InvalidUserIdError | UserNotFoundError;

function findUser({ userId }: { userId: string }): ServiceResult<User, FindUserError> {
  if (userId.length === 0) {
    return failure(new InvalidUserIdError());
  }

  if (userId === "missing") {
    return failure(new UserNotFoundError({ userId }));
  }

  return success({ id: userId, name: "Ada" });
}

const message = matchServiceResult(findUser({ userId: "missing" }), {
  onSuccess: (user) => `Found ${user.name}`,
  onError: {
    InvalidUserIdError: (error) => error.message,
    UserNotFoundError: (error) => `User ${error.userId} was not found`,
  },
});

strictEqual(message, "User missing was not found");
