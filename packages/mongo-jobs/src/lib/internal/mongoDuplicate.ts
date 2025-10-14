import { MongoError } from "mongodb";

const MONGO_DUPLICATE_KEY_ERROR_CODE = 11_000;

export function isMongoDuplicateError(error: unknown): error is MongoError {
  return (
    (error instanceof MongoError ||
      (error instanceof Object &&
        "name" in error &&
        "code" in error &&
        (error.name === "MongoServerError" || error.name === "MongoError"))) &&
    error.code === MONGO_DUPLICATE_KEY_ERROR_CODE
  );
}
