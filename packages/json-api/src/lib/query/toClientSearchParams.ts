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
 * @see [Example](https://github.com/ClipboardHealth/core-utils/blob/main/packages/json-api/examples/toSearchParams.ts)
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
