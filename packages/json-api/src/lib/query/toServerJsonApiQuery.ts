import { type ServerJsonApiQuery } from "../types";

const REGEX = {
  fields: /^fields\[(.*?)]$/i,
  filter: /^filter\[([^\]]*?)]$/i,
  filterType: /^filter\[(.*?)]\[(.*?)]$/i,
  include: /^include$/i,
  page: /^page\[(.*?)]$/i,
  sort: /^sort$/i,
} as const;

/**
 * Call this function from servers to convert from {@link URLSearchParams} to {@link ServerJsonApiQuery}.
 *
 * @example
 * <embedex source="packages/json-api/examples/toServerJsonApiQuery.ts">
 *
 * ```ts
 * import { deepEqual } from "node:assert/strict";
 *
 * import { type ServerJsonApiQuery, toServerJsonApiQuery } from "@clipboard-health/json-api";
 *
 * const [date1, date2] = ["2024-01-01", "2024-01-02"];
 * // The URLSearchParams constructor also supports URL-encoded strings
 * const searchParams = new URLSearchParams(
 *   `fields[user]=age,dateOfBirth&filter[age]=2&filter[dateOfBirth][gt]=${date1}&filter[dateOfBirth][lt]=${date2}&filter[isActive]=true&include=article&page[size]=10&sort=-age`,
 * );
 *
 * const query: ServerJsonApiQuery = toServerJsonApiQuery(searchParams);
 *
 * deepEqual(query, {
 *   fields: { user: ["age", "dateOfBirth"] },
 *   filter: {
 *     age: { eq: ["2"] },
 *     dateOfBirth: { gt: [date1], lt: [date2] },
 *     isActive: { eq: ["true"] },
 *   },
 *   include: ["article"],
 *   page: {
 *     size: "10",
 *   },
 *   sort: ["-age"],
 * });
 * ```
 *
 * </embedex>
 */
export function toServerJsonApiQuery(searchParams: URLSearchParams): ServerJsonApiQuery {
  return [...searchParams].reduce<ServerJsonApiQuery>((accumulator, [key, value]) => {
    const match = Object.entries(REGEX).find(([, regex]) => regex.test(key));
    if (!match) {
      return accumulator;
    }

    const [type, regex] = match as [keyof typeof REGEX, RegExp];
    const groups = regex.exec(key)?.slice(1);
    if (type === "fields" && groups?.[0]) {
      return {
        ...accumulator,
        fields: {
          ...accumulator.fields,
          [groups[0]]: value.split(","),
        },
      };
    }

    if ((type === "filter" || type === "filterType") && groups?.length) {
      const [field, fieldType] = groups;
      if (field) {
        return {
          ...accumulator,
          filter: {
            ...accumulator.filter,
            [field]: {
              ...accumulator.filter?.[field],
              [fieldType ?? "eq"]: value.split(","),
            },
          },
        };
      }
    }

    if (type === "include" || type === "sort") {
      return { ...accumulator, [type]: value.split(",") };
    }

    if (type === "page" && groups?.[0]) {
      return {
        ...accumulator,
        page: { ...accumulator.page, [groups[0]]: value },
      };
    }

    /* istanbul ignore next */
    return accumulator;
  }, {});
}
