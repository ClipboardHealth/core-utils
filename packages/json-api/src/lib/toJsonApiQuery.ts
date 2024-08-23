import { type JsonApiQuery } from "./types";

const REGEX = {
  fields: /^fields\[(.*?)]$/i,
  filter: /^filter\[([^\]]*?)]$/i,
  filterType: /^filter\[(.*?)]\[(.*?)]$/i,
  include: /^include$/i,
  page: /^page\[(.*?)]$/i,
  sort: /^sort$/i,
} as const;

/**
 * Call this function from clients to converts from {@link URLSearchParams} to {@link JsonApiQuery}.
 *
 * @see [Example](https://github.com/ClipboardHealth/core-utils/blob/main/packages/json-api/examples/toJsonApiQuery.ts)
 */
export function toJsonApiQuery(searchParams: URLSearchParams): JsonApiQuery {
  // eslint-disable-next-line sonarjs/cognitive-complexity
  return [...searchParams].reduce<JsonApiQuery>((accumulator, [key, value]) => {
    const match = Object.entries(REGEX).find(([, regex]) => regex.test(key));
    if (!match) {
      return accumulator;
    }

    const [type, regex] = match;
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
      const [field, subfield] = groups;
      if (field) {
        return {
          ...accumulator,
          filter: {
            ...accumulator.filter,
            [field]: subfield
              ? {
                  // eslint-disable-next-line unicorn/no-useless-fallback-in-spread
                  ...(accumulator.filter?.[field] ?? {}),
                  [subfield]: value,
                }
              : value.split(","),
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
