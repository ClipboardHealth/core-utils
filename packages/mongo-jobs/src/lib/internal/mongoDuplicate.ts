import { MongoServerError } from "mongodb";

const MONGO_DUPLICATE_KEY_ERROR_CODE = 11_000;

export function isMongoDuplicateError(error: unknown): error is MongoServerError {
  return error instanceof MongoServerError && error.code === MONGO_DUPLICATE_KEY_ERROR_CODE;
}
