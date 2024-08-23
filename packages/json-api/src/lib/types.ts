/**
 * Filter operators to build complex filter queries.
 * - gt: Greater than
 * - gte: Greater than or equal to
 * - lt: Less than
 * - lte: Less than or equal to
 * - not: Not equal to
 */
type FieldType = "gt" | "gte" | "lt" | "lte" | "not";

/**
 * A JSON:API URL query string.
 */
export interface JsonApiQuery {
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
  filter?: Record<string, string[] | { [K in FieldType]?: string }>;

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
  page?: { [K in "cursor" | "limit" | "number" | "offset" | "size"]?: string };

  /**
   * Sorting data. Include the "-" prefix for descending order.
   *
   * @see {@link https://jsonapi.org/format/#fetching-sorting Sorting}
   */
  sort?: string[];
}
