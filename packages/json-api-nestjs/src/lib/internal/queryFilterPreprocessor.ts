/**
 * NestJS-specific query processing based on the output of `ctx.switchToHttp().getRequest().query`.
 *
 * We handle the following cases:
 * 1. For `?filter[age]=10,20`, `value` is `10,20`, which we transform to `{eq: "10,20"}`.
 * 2. For `?filter[age]=20`, `value` is `20`, which we transform to `{eq: "20"}`.
 * 3. For `?filter[age][gt]=10&filter[age]=20`, `value` may be `[{gt: "10"}, "20"]` or
 *    `{"20": true, gt: "10"}`, which we transform to `{eq: "20", gt: "10"}`.
 * 4. For `?filter[age]=10&filter[age]=20`, `value` is `['10', '20']`, which we transform to `{eq:
 *    "10,20"}`.
 * 5. For `?filter[age][gt]=5&filter[age]=10&filter[age]=20`, `value` is `{'0': '10', '1': '20', gt:
 *    '5'}`, which we transform to `{eq: "10,20", gt: "5"}`.
 */
export function queryFilterPreprocessor(value: unknown): Record<string, string> {
  if (Array.isArray(value)) {
    return normalizeArrayFilter(value);
  }

  if (!isObject(value)) {
    // Cases 1 and 2.
    return { eq: String(value) };
  }

  return normalizeObjectFilter(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && value !== undefined && typeof value === "object";
}

function appendFilterValue(filter: Record<string, string>, key: string, value: string) {
  return {
    ...filter,
    [key]: filter[key] ? `${filter[key]},${value}` : value,
  };
}

function mergeFilters(currentFilter: Record<string, string>, newFilter: Record<string, string>) {
  return Object.entries(newFilter).reduce(
    (mergedFilter, [key, value]) => appendFilterValue(mergedFilter, key, value),
    currentFilter,
  );
}

function normalizeArrayFilter(value: readonly unknown[]): Record<string, string> {
  return value.reduce<Record<string, string>>((filter, filterValue) => {
    if (Array.isArray(filterValue)) {
      return mergeFilters(filter, normalizeArrayFilter(filterValue));
    }

    if (isObject(filterValue)) {
      return mergeFilters(filter, normalizeObjectFilter(filterValue));
    }

    return appendFilterValue(filter, "eq", String(filterValue));
  }, {});
}

function normalizeObjectFilter(value: Record<string, unknown>): Record<string, string> {
  return Object.entries(value).reduce<Record<string, string>>((filter, [key, filterValue]) => {
    if (typeof filterValue === "boolean") {
      return appendFilterValue(filter, "eq", key);
    }

    if (/^\d+$/.test(key)) {
      if (Array.isArray(filterValue)) {
        return mergeFilters(filter, normalizeArrayFilter(filterValue));
      }

      if (isObject(filterValue)) {
        return mergeFilters(filter, normalizeObjectFilter(filterValue));
      }

      return appendFilterValue(filter, "eq", String(filterValue));
    }

    return appendFilterValue(
      filter,
      key,
      Array.isArray(filterValue) ? filterValue.join(",") : String(filterValue),
    );
  }, {});
}
