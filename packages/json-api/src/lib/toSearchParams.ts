import { URLSearchParams } from "node:url";

import { type JsonApiQuery } from "./types";

/**
 * Call this function from clients to converts from {@link JsonApiQuery} to {@link URLSearchParams}.
 *
 * @see [Example](https://github.com/ClipboardHealth/core-utils/blob/main/packages/json-api/examples/toSearchParams.ts)
 */
export function toSearchParams(query: JsonApiQuery): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (query.fields) {
    for (const [type, fields] of Object.entries(query.fields)) {
      searchParams.append(`fields[${type}]`, fields.join(","));
    }
  }

  handleFilter(query, searchParams);

  if (query.include) {
    searchParams.append("include", query.include.join(","));
  }

  if (query.page) {
    for (const [key, value] of Object.entries(query.page)) {
      searchParams.append(`page[${key}]`, value);
    }
  }

  if (query.sort) {
    searchParams.append("sort", query.sort.join(","));
  }

  return searchParams;
}

function handleFilter(query: JsonApiQuery, searchParams: URLSearchParams) {
  if (query.filter) {
    for (const [key, value] of Object.entries(query.filter)) {
      if (Array.isArray(value)) {
        searchParams.append(`filter[${key}]`, value.join(","));
      } else if (typeof value === "object") {
        for (const [subKey, subValue] of Object.entries(value)) {
          searchParams.append(`filter[${key}][${subKey}]`, String(subValue));
        }
      }
    }
  }
}
