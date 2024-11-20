import { type DestinationPath, type SourcePath } from "../types";

export interface Source {
  content: string;
  destinations: DestinationPath[];
}
export type SourceMap = ReadonlyMap<SourcePath, Source>;

export interface Destination {
  content: string;
  sources: ReadonlySet<SourcePath>;
}
export type DestinationMap = ReadonlyMap<DestinationPath, Destination>;
