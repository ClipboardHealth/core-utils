import { type Arrayable } from "type-fest";

export type ApiType = string;

export type Field = string;

export interface Relationship {
  data: Arrayable<{ type: ApiType; id: string }>;
}

export type Meta = Record<string, unknown>;

export type ApiLinks = Record<string, string | undefined>;

/**
 * The JSON:API document shape.
 */
export interface JsonApiDocument {
  data: {
    attributes: Record<string, unknown>;
    id: string;
    included?: JsonApiDocument[];
    links?: ApiLinks;
    meta?: Meta;
    relationships?: Record<string, Relationship>;
    type: ApiType;
  };
  meta?: Meta;
  links?: ApiLinks;
  jsonapi?: {
    ext?: Record<string, unknown>;
    profile?: string;
    version?: string;
    meta?: Meta;
  };
}
