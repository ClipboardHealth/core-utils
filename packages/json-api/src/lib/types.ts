/**
 * Filter types to build complex filter queries.
 * - eq: Equal to; the default when no filter type is provided, do not explicitly include it.
 * - ne: Not equal to.
 * - gt: Greater than.
 * - gte: Greater than or equal to.
 * - lt: Less than.
 * - lte: Less than or equal to.
 * - not: Not.
 */
type FilterType = "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "not";

type PageKey = "cursor" | "limit" | "number" | "offset" | "size";

interface JsonApiQueryTypes {
  filterValue: unknown;
  pageValue: unknown;
}

export interface ClientTypes {
  filterValue: Array<Date | number | string | boolean>;
  pageValue: number | string;
}

interface ServerTypes {
  filterValue: string[];
  pageValue: string;
}

/**
 * A JSON:API URL query string.
 */
interface JsonApiQuery<T extends JsonApiQueryTypes> {
  /**
   * Fields to include in the response.
   *
   * @see {@link https://jsonapi.org/format/#fetching-sparse-fieldsets Sparse fieldsets}
   */
  fields?: Record<string, string[]>;

  /**
   * Filters to apply to the query.
   *
   * @see {@link https://jsonapi.org/recommendations/#filtering Filtering}
   * @see {@link https://discuss.jsonapi.org/t/share-propose-a-filtering-strategy/257 Filtering strategy}
   */
  filter?: Record<string, { [K in FilterType]?: T["filterValue"] }>;

  /**
   * Relationships to include in the response.
   *
   * @see {@link https://jsonapi.org/format/#fetching-includes Fetching includes}
   */
  include?: string[];

  /**
   * Pagination data.
   *
   * @see {@link https://jsonapi.org/format/#fetching-pagination Pagination}
   * @see {@link https://jsonapi.org/examples/#pagination Pagination examples}
   */
  page?: { [K in PageKey]?: T["pageValue"] };

  /**
   * Sorting data. Include the "-" prefix for descending order.
   *
   * @see {@link https://jsonapi.org/format/#fetching-sorting Sorting}
   */
  sort?: string[];
}

export type ClientJsonApiQuery = JsonApiQuery<ClientTypes>;

export type ServerJsonApiQuery = JsonApiQuery<ServerTypes>;
