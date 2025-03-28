import { type Arrayable } from "type-fest";

export type ApiType = string;

export type Field = string;

export type Meta = Record<string, unknown>;

export type ApiLinks = Record<string, string | undefined>;

export interface Relationship {
  data?: Arrayable<{ id?: string; type?: ApiType }>;
  links?: ApiLinks;
  meta?: Meta;
}

export type Relationships = Record<string, Relationship | undefined>;

export interface Data {
  attributes?: Record<string, unknown>;
  id?: string;
  links?: ApiLinks;
  meta?: Meta;
  relationships?: Relationships;
  type?: ApiType;
}

/**
 * The JSON:API document shape for use by more specific types.
 */
export interface JsonApiDocument {
  data?: Arrayable<Data>;
  included?: Data[];
  jsonapi?: {
    ext?: Record<string, unknown>;
    meta?: Meta;
    profile?: string;
    version?: string;
  };
  links?: ApiLinks;
  meta?: Meta;
}
