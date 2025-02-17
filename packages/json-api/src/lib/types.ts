/**
 * Filter operators to build complex filter queries.
 * - eq: Equal to; the default when no filter operator is provided, do not explicitly include it.
 * - ne: Not equal to.
 * - gt: Greater than.
 * - gte: Greater than or equal to.
 * - lt: Less than.
 * - lte: Less than or equal to.
 */
export type FilterOperator = "eq" | "ne" | "gt" | "gte" | "lt" | "lte";

export type PageKey = "cursor" | "limit" | "number" | "offset" | "size";

export { type URLSearchParams } from "node:url";

export type FilterValue = Date | number | string | boolean;

/**
 * A JSON:API URL query string.
 */
export interface ServerJsonApiQuery {
  /**
   * Fields to include in the response.
   *
   * @see {@link https://jsonapi.org/format/#fetching-sparse-fieldsets JSON:API sparse fieldsets}
   */
  fields?: Record<string, string | string[]>;

  /**
   * Filters to apply to the query.
   *
   * @see {@link https://jsonapi.org/recommendations/#filtering JSON:API filtering}
   * @see {@link https://discuss.jsonapi.org/t/share-propose-a-filtering-strategy/257 JSON:API filtering strategy}
   */
  filter?: Record<string, string | string[] | { [K in FilterOperator]?: string | string[] }>;

  /**
   * Relationships to include in the response.
   *
   * @see {@link https://jsonapi.org/format/#fetching-includes JSON:API fetching includes}
   */
  include?: string | string[];

  /**
   * Pagination data.
   *
   * @see {@link https://jsonapi.org/format/#fetching-pagination JSON:API pagination}
   * @see {@link https://jsonapi.org/examples/#pagination JSON:API pagination examples}
   */
  page?: { [K in PageKey]?: string };

  /**
   * Sorting data. Include the "-" prefix for descending order.
   *
   * @see {@link https://jsonapi.org/format/#fetching-sorting JSON:API sorting}
   */
  sort?: string | string[];
}

/**
 * The value types that can be used in a filter.
 */
export type FilterObject = {
  [K in FilterOperator]?: FilterValue | FilterValue[];
};

/**
 * A nested filter object for hierarchical filtering.
 */
export interface NestedFilter {
  [key: string]: FilterValue | FilterValue[] | FilterObject | NestedFilter | undefined;
}

/**
 * A JSON:API URL query string.
 */
export interface ClientJsonApiQuery {
  /**
   * Fields to include in the response.
   *
   * @see {@link https://jsonapi.org/format/#fetching-sparse-fieldsets JSON:API sparse fieldsets}
   */
  fields?: Record<string, string | string[]>;

  /**
   * Filters to apply to the query.
   * Values can be:
   * - A single value for equality: `{ age: 25 }`
   * - An array of values for equality: `{ status: ['active', 'pending'] }`
   * - An object with operators: `{ age: { gt: 25, lte: 35 } }`
   * - A nested object for hierarchical filtering: `{ location: { latitude: 40, longitude: -104 } }`
   * - null/undefined to exclude the filter
   *
   * @see {@link https://jsonapi.org/recommendations/#filtering JSON:API filtering}
   * @see {@link https://discuss.jsonapi.org/t/share-propose-a-filtering-strategy/257 JSON:API filtering strategy}
   */
  filter?: Record<string, FilterValue | FilterValue[] | FilterObject | NestedFilter | undefined>;

  /**
   * Relationships to include in the response.
   *
   * @see {@link https://jsonapi.org/format/#fetching-includes JSON:API fetching includes}
   */
  include?: string | string[];

  /**
   * Pagination data.
   *
   * @see {@link https://jsonapi.org/format/#fetching-pagination JSON:API pagination}
   * @see {@link https://jsonapi.org/examples/#pagination JSON:API pagination examples}
   */
  page?: { [K in PageKey]?: number | string };

  /**
   * Sorting data. Include the "-" prefix for descending order.
   *
   * @see {@link https://jsonapi.org/format/#fetching-sorting JSON:API sorting}
   */
  sort?: string | string[];
}
