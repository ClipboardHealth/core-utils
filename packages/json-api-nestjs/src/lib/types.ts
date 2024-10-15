import { type Arrayable } from "type-fest";

export type ApiType = string;

export type Field = string;

export type Meta = Record<string, unknown>;

export type ApiLinks = Record<string, string | undefined>;

export interface Relationship {
  data: Arrayable<{ id: string; type: ApiType }>;
  links?: ApiLinks;
  meta?: Meta;
}

export interface Data {
  attributes: Record<string, unknown>;
  id: string;
  links?: ApiLinks;
  meta?: Meta;
  relationships?: Record<string, Relationship>;
  type: ApiType;
}

/**
 * The JSON:API document shape.
 */
export interface JsonApiDocument {
  data: Arrayable<Data>;
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
