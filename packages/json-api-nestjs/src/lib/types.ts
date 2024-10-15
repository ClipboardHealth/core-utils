export type ApiType = string;

export type Field = string;

export interface Relationship {
  data?: { type?: ApiType; id?: string };
}

/**
 * The shape of a JSON:API document.
 */
export interface JsonApiDocument {
  data: {
    attributes: Record<Field, unknown>;
    id?: string;
    included?: JsonApiDocument[];
    links?: Record<string, string>;
    meta?: Record<string, unknown>;
    relationships?: Record<string, Relationship | Relationship[]>;
    type: ApiType;
  };
}
