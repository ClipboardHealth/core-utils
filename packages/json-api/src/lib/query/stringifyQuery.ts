import {
  type ClientJsonApiQuery,
  FILTER_OPERATORS,
  type FilterOperator,
  type FilterValue,
  type JsonApiQuery,
} from "../types";

const filterOperators = new Set(FILTER_OPERATORS);

/**
 * Converts from an ergonomic query format to URLSearchParams, providing a more user-friendly API
 * than {@link toClientSearchParams} while maintaining JSON:API compliance.
 *
 * @example
 * <embedex source="packages/json-api/examples/stringifyQuery.ts">
 *
 * ```ts
 * import { deepEqual } from "node:assert/strict";
 *
 * import { stringifyQuery } from "@clipboard-health/json-api";
 *
 * import { type JsonApiQuery } from "../src/lib/types";
 *
 * const [date1, date2] = ["2024-01-01", "2024-01-02"];
 * const query: JsonApiQuery = {
 *   fields: { user: ["age", "dateOfBirth"] },
 *   filter: {
 *     age: 2,
 *     dateOfBirth: {
 *       gt: date1,
 *       lt: date2,
 *     },
 *     isActive: true,
 *   },
 *   include: "article",
 *   page: {
 *     size: 10,
 *   },
 *   sort: "-age",
 * };
 *
 * deepEqual(
 *   stringifyQuery(query).toString(),
 *   new URLSearchParams(
 *     `fields[user]=age,dateOfBirth&filter[age]=2&filter[dateOfBirth][gt]=${date1}&filter[dateOfBirth][lt]=${date2}&filter[isActive]=true&include=article&page[size]=10&sort=-age`,
 *   ).toString(),
 * );
 * ```
 *
 * </embedex>
 */
// eslint-disable-next-line sonarjs/cognitive-complexity
export function stringifyQuery(query: JsonApiQuery): URLSearchParams {
  const clientQuery: ClientJsonApiQuery = {
    ...(query.fields && {
      fields: Object.fromEntries(
        Object.entries(query.fields).map(([key, value]) => [
          key,
          Array.isArray(value) ? value : [value],
        ]),
      ),
    }),
    ...(query.filter && {
      filter: Object.entries(query.filter).reduce<NonNullable<ClientJsonApiQuery["filter"]>>(
        (accumulator, [key, value]) => {
          if (isNil(value)) {
            return accumulator;
          }

          if (isFilterOperator(value)) {
            const ops: NonNullable<ClientJsonApiQuery["filter"]>[string] = {};
            for (const [op, v] of Object.entries(value)) {
              if (v !== undefined) {
                const filterValues = toFilterValue(v);
                if (filterValues.length > 0) {
                  ops[op as FilterOperator] = filterValues;
                }
              }
            }

            return Object.keys(ops).length > 0 ? { ...accumulator, [key]: ops } : accumulator;
          }

          const filterValues = toFilterValue(value);
          return filterValues.length > 0
            ? { ...accumulator, [key]: { eq: filterValues } }
            : accumulator;
        },
        {},
      ),
    }),
    ...(query.include && {
      include: Array.isArray(query.include) ? query.include : [query.include],
    }),
    ...(query.page && {
      page: Object.fromEntries(
        Object.entries(query.page).map(([key, value]) => [key, String(value)]),
      ),
    }),
    ...(query.sort && {
      sort: Array.isArray(query.sort) ? query.sort : [query.sort],
    }),
  };

  return toClientSearchParams(clientQuery);
}

/**
 * @deprecated Use {@link stringifyQuery} instead.
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

function filterValueString(value: FilterValue): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function join(values: string[]): string {
  return values.join(",");
}

function toFilterValue(value: NonNullable<JsonApiQuery["filter"]>[string]): FilterValue[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (isFilterValue(value)) {
    return [value];
  }

  return [];
}

function isFilterOperator(
  value: NonNullable<JsonApiQuery["filter"]>[string],
): value is { [K in FilterOperator]?: FilterValue | FilterValue[] } {
  return (
    !isNil(value) &&
    typeof value === "object" &&
    Object.keys(value).some((key) => filterOperators.has(key as FilterOperator))
  );
}

function isFilterValue(value: NonNullable<JsonApiQuery["filter"]>[string]): value is FilterValue {
  return (
    value instanceof Date ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

// eslint-disable-next-line @typescript-eslint/ban-types
function isNil(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}
