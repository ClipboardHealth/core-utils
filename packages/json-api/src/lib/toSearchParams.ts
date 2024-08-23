import { URLSearchParams } from "node:url";

import { type JsonApiQuery } from "./types";

/**
 * Call this function from clients to convert from {@link JsonApiQuery} to {@link URLSearchParams}.
 *
 * @see [Example](https://github.com/ClipboardHealth/core-utils/blob/main/packages/json-api/examples/toSearchParams.ts)
 */
export function toSearchParams(query: JsonApiQuery): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (query.fields) {
    Object.entries(query.fields).forEach(([type, fields]) => {
      searchParams.append(`fields[${type}]`, fields.join(","));
    });
  }

  handleFilter(query, searchParams);

  if (query.include) {
    searchParams.append("include", query.include.join(","));
  }

  if (query.page) {
    Object.entries(query.page).forEach(([key, value]) => {
      searchParams.append(`page[${key}]`, value);
    });
  }

  if (query.sort) {
    searchParams.append("sort", query.sort.join(","));
  }

  return searchParams;
}

function handleFilter(query: JsonApiQuery, searchParams: URLSearchParams) {
  if (query.filter) {
    Object.entries(query.filter).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        searchParams.append(`filter[${key}]`, value.join(","));
      } else if (typeof value === "object") {
        Object.entries(value).forEach(([subKey, subValue]) => {
          searchParams.append(`filter[${key}][${subKey}]`, String(subValue));
        });
      }
    });
  }
}
