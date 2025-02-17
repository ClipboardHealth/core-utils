/**
 * Filter operators to build complex filter queries.
 * - eq: Equal to; the default when no filter operator is provided, do not explicitly include it.
 * - ne: Not equal to.
 * - gt: Greater than.
 * - gte: Greater than or equal to.
 * - lt: Less than.
 * - lte: Less than or equal to.
 */
export const FILTER_OPERATORS = ["eq", "ne", "gt", "gte", "lt", "lte"] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

type PageKey = "cursor" | "limit" | "number" | "offset" | "size";

export { type URLSearchParams } from "node:url";

export type FilterValue = Date | number | string | boolean;

export interface JsonApiQueryTypes {
  filterValue: unknown;
  pageValue: unknown;
}

export interface ClientTypes {
  filterValue: FilterValue[];
  pageValue: number | string;
}

export interface ServerTypes {
  filterValue: string[];
  pageValue: string;
}

/**
 * A JSON:API URL query string.
 */
interface Query<T extends JsonApiQueryTypes> {
  /**
   * Fields to include in the response.
   *
   * @see {@link https://jsonapi.org/format/#fetching-sparse-fieldsets JSON:API sparse fieldsets}
   */
  fields?: Record<string, string[]>;

  /**
   * Filters to apply to the query.
   *
   * @see {@link https://jsonapi.org/recommendations/#filtering JSON:API filtering}
   * @see {@link https://discuss.jsonapi.org/t/share-propose-a-filtering-strategy/257 JSON:API filtering strategy}
   */
  filter?: Record<string, { [K in FilterOperator]?: T["filterValue"] }>;

  /**
   * Relationships to include in the response.
   *
   * @see {@link https://jsonapi.org/format/#fetching-includes JSON:API fetching includes}
   */
  include?: string[];

  /**
   * Pagination data.
   *
   * @see {@link https://jsonapi.org/format/#fetching-pagination JSON:API pagination}
   * @see {@link https://jsonapi.org/examples/#pagination JSON:API pagination examples}
   */
  page?: { [K in PageKey]?: T["pageValue"] };

  /**
   * Sorting data. Include the "-" prefix for descending order.
   *
   * @see {@link https://jsonapi.org/format/#fetching-sorting JSON:API sorting}
   */
  sort?: string[];
}

export type ClientJsonApiQuery = Query<ClientTypes>;

export type ServerJsonApiQuery = Query<ServerTypes>;

/**
 * A more ergonomic query format that gets converted to {@link ClientJsonApiQuery}.
 * This format is closer to common query builders while maintaining JSON:API compliance.
 */
export interface JsonApiQuery
  extends Omit<ClientJsonApiQuery, "fields" | "filter" | "sort" | "include"> {
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
   * - null/undefined to exclude the filter
   *
   * @see {@link https://jsonapi.org/recommendations/#filtering JSON:API filtering}
   * @see {@link https://discuss.jsonapi.org/t/share-propose-a-filtering-strategy/257 JSON:API filtering strategy}
   */
  filter?: Record<
    string,
    | FilterValue
    | FilterValue[]
    | {
        [K in FilterOperator]?: FilterValue | FilterValue[];
      }
    | undefined
  >;

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
