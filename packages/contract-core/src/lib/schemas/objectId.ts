import { z } from "zod";

/**
 * Zod schema for a MongoDB ObjectId as a **24-character hexadecimal string** (`[0-9A-Fa-f]{24}`).
 *
 * - **Coercion:** Uses `z.coerce.string()` so inputs that stringify to a valid ObjectId hex string are accepted (useful when validation runs before JSON serialization and BSON `ObjectId` values are still present).
 * - **Output type:** {@link MongoObjectId} — a branded string so plain `string` is not assignable without parsing. Branding does not change runtime values or JSON.
 *
 * Compose with `.optional()`, `.nullable()`, `.nullish()`, domain-specific `.brand()`, or `commaSeparatedArray(objectId)` for query-string id lists.
 */
export const objectId = z.coerce
  .string()
  .regex(/^[\dA-Fa-f]{24}$/, "Must be a valid ObjectId")
  .brand<"MongoObjectId">();

export type MongoObjectId = z.infer<typeof objectId>;
