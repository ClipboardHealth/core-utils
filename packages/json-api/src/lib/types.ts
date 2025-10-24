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

export type FilterObject = Partial<Record<FilterOperator, FilterValue | FilterValue[]>>;

export interface NestedFilter {
  [key: string]: FilterValue | FilterValue[] | FilterObject | NestedFilter | undefined;
}

/**
 * A JSON:API URL query.
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
  page?: Partial<Record<PageKey, number | string>>;

  /**
   * Sorting data. Include the "-" prefix for descending order.
   *
   * @see {@link https://jsonapi.org/format/#fetching-sorting JSON:API sorting}
   */
  sort?: string | string[];
}

/**
 * A JSON:API URL query.
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
  filter?: Record<string, string | string[] | Partial<Record<FilterOperator, string | string[]>>>;

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
  page?: Partial<Record<PageKey, string>>;

  /**
   * Sorting data. Include the "-" prefix for descending order.
   *
   * @see {@link https://jsonapi.org/format/#fetching-sorting JSON:API sorting}
   */
  sort?: string | string[];
}
