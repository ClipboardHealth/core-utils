export type SourcePath = string;
export type DestinationPath = string;

export interface EmbedParams {
  cwd: string;
  sourcesGlob: string;
  write: boolean;
}

export type Code = "NO_CHANGE" | "NO_MATCH" | "UPDATE";

export interface Result {
  code: Code;
  paths: {
    sources: SourcePath[];
    destination: DestinationPath;
  };
}

export type NoMatch = Result & { code: "NO_MATCH" };
export type NoChange = Result & { code: "NO_CHANGE" };
export type Updated = Result & { code: "UPDATE"; updatedContent: string };
export type Embed = NoMatch | Updated | NoChange;

export interface EmbedResult {
  embeds: Embed[];
  sources: Array<{ path: SourcePath; destinations: DestinationPath[] }>;
  destinations: Array<{ path: DestinationPath; sources: SourcePath[] }>;
}
