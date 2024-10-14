/**
 * Filter types to build complex filter queries.
 * - eq: Equal to; the default when no filter type is provided, do not explicitly include it.
 * - ne: Not equal to.
 * - gt: Greater than.
 * - gte: Greater than or equal to.
 * - lt: Less than.
 * - lte: Less than or equal to.
 */
type FilterType = "eq" | "ne" | "gt" | "gte" | "lt" | "lte";

type PageKey = "cursor" | "limit" | "number" | "offset" | "size";

export { type URLSearchParams } from "node:url";

export interface JsonApiQueryTypes {
  filterValue: unknown;
  pageValue: unknown;
}

export interface ClientTypes {
  filterValue: Array<Date | number | string | boolean>;
  pageValue: number | string;
}

export interface ServerTypes {
  filterValue: string[];
  pageValue: string;
}

/**
 * A JSON:API URL query string.
 */
export interface JsonApiQuery<T extends JsonApiQueryTypes> {
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
  filter?: Record<string, { [K in FilterType]?: T["filterValue"] }>;

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

export type ClientJsonApiQuery = JsonApiQuery<ClientTypes>;

export type ServerJsonApiQuery = JsonApiQuery<ServerTypes>;
