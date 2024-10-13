/**
 * NestJS-specific query processing based on the output of `ctx.switchToHttp().getRequest().query`.
 *
 * We handle the following cases:
 * 1. For `?filter[age]=10,20`, `value` is `10,20`, which we transform to `{eq: "10,20"}`.
 * 2. For `?filter[age]=20`, `value` is `20`, which we transform to `{eq: "20"}`.
 * 3. For `?filter[age][gt]=10&filter[age]=20`, `value` is `{'20': true, gt: '10'}`, which we
 *    transform to `{eq: "20", gt: "10"}`.
 * 4. For `?filter[age]=10&filter[age]=20`, `value` is `['10', '20']`, which we transform to `{eq:
 *    "10,20"}`.
 * 5. For `?filter[age][gt]=5&filter[age]=10&filter[age]=20`, `value` is `{'0': '10', '1': '20', gt:
 *    '5'}`, which we transform to `{eq: "10,20", gt: "5"}`.
 */

export function queryFilterPreprocessor(value: unknown): Record<string, string> {
  if (!isObject(value)) {
    // Cases 1 and 2.
    return { eq: String(value) };
  }

  return Object.entries(value).reduce<Record<string, string>>((filter, [key, value]) => {
    const boolValue = typeof value === "boolean";
    if (/^\d+$/.test(key) || boolValue) {
      // Cases 3 and 5.
      const eq = boolValue ? key : String(value);
      return {
        ...filter,
        eq: filter["eq"] ? `${filter["eq"]},${eq}` : eq,
      };
    }

    // Case 4 and other cases like `gt`, `lt`, etc.
    const stringValue = Array.isArray(value) ? value.join(",") : String(value);
    return {
      ...filter,
      [key]: filter[key] ? `${filter[key]},${stringValue}` : stringValue,
    };
  }, {});
}

function isObject(value: unknown): value is Record<string, unknown> {
  // eslint-disable-next-line no-eq-null, unicorn/no-null
  return value != null && typeof value === "object";
}
