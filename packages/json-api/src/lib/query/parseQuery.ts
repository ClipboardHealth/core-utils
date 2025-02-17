import { parse } from "qs";

import { type ServerJsonApiQuery } from "../types";

/**
 * Call this function from servers to convert from {@link URLSearchParams} to {@link ServerJsonApiQuery}.
 *
 * @example
 * <embedex source="packages/json-api/examples/parseQuery.ts">
 *
 * ```ts
 * import { deepEqual } from "node:assert/strict";
 *
 * import { parseQuery } from "@clipboard-health/json-api";
 *
 * import { type ServerJsonApiQuery } from "../src/lib/types";
 *
 * const [date1, date2] = ["2024-01-01", "2024-01-02"];
 * // The URLSearchParams constructor also supports URL-encoded strings
 * const searchParams = new URLSearchParams(
 *   `fields[user]=age,dateOfBirth&filter[age]=2&filter[dateOfBirth][gt]=${date1}&filter[dateOfBirth][lt]=${date2}&filter[isActive]=true&include=article&page[size]=10&sort=-age`,
 * );
 *
 * const query: ServerJsonApiQuery = parseQuery(searchParams.toString());
 *
 * deepEqual(query, {
 *   fields: { user: ["age", "dateOfBirth"] },
 *   filter: {
 *     age: "2",
 *     dateOfBirth: { gt: date1, lt: date2 },
 *     isActive: "true",
 *   },
 *   include: "article",
 *   page: {
 *     size: "10",
 *   },
 *   sort: "-age",
 * });
 * ```
 *
 * </embedex>
 */
export function parseQuery(query: string): ServerJsonApiQuery {
  return parse(query, {
    decoder: (item, defaultDecoder, charset, type) => {
      const decoded = decodeURIComponent(item);
      if (type === "value") {
        return decoded.includes(",") ? decoded.split(",") : decoded;
      }

      return defaultDecoder(decoded, charset, type);
    },
    ignoreQueryPrefix: true,
  }) as ServerJsonApiQuery;
}
