import { type ClientJsonApiQuery, type ClientTypes } from "../types";

function filterValueString(value: ClientTypes["filterValue"][number]): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function join(values: string[]): string {
  return values.join(",");
}

/**
 * Call this function from clients to convert from {@link ClientJsonApiQuery} to {@link URLSearchParams}.
 *
 * @example
 * ```ts
 * // packages/json-api/examples/toClientSearchParams.ts
 * import { deepEqual } from "node:assert/strict";
 *
 * import { toClientSearchParams } from "@clipboard-health/json-api";
 *
 * import { type ClientJsonApiQuery } from "../src/lib/types";
 *
 * const [date1, date2] = ["2024-01-01", "2024-01-02"];
 * const query: ClientJsonApiQuery = {
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
 * };
 *
 * deepEqual(
 *   toClientSearchParams(query).toString(),
 *   new URLSearchParams(
 *     `fields[user]=age,dateOfBirth&filter[age]=2&filter[dateOfBirth][gt]=${date1}&filter[dateOfBirth][lt]=${date2}&filter[isActive]=true&include=article&page[size]=10&sort=-age`,
 *   ).toString(),
 * );
 *
 * ```
 */
export function toClientSearchParams(query: ClientJsonApiQuery): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (query.fields) {
    Object.entries(query.fields).forEach(([type, fields]) => {
      searchParams.append(`fields[${type}]`, join(fields));
    });
  }

  if (query.filter) {
    Object.entries(query.filter).forEach(([field, values]) => {
      const filterField = `filter[${field}]`;
      Object.entries(values).forEach(([fieldType, value]) => {
        searchParams.append(
          fieldType === "eq" ? filterField : `${filterField}[${fieldType}]`,
          join(value.map((value) => filterValueString(value))),
        );
      });
    });
  }

  if (query.include) {
    searchParams.append("include", join(query.include));
  }

  if (query.page) {
    Object.entries(query.page).forEach(([key, value]) => {
      searchParams.append(`page[${key}]`, String(value));
    });
  }

  if (query.sort) {
    searchParams.append("sort", join(query.sort));
  }

  return searchParams;
}
