export type SourcePath = string;
export type DestinationPath = string;

export interface EmbedParams {
  cwd: string;
  sourcesGlob: string;
  write: boolean;
}

export type Code = "NO_CHANGE" | "NO_MATCH" | "UPDATE" | "INVALID_SOURCE" | "UNREFERENCED_SOURCE";

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
export type InvalidSource = Result & { code: "INVALID_SOURCE"; invalidSources: string[] };
export type UnreferencedSource = Result & {
  code: "UNREFERENCED_SOURCE";
  unreferencedSources: string[];
};
export type Embed = NoMatch | Updated | NoChange | InvalidSource | UnreferencedSource;

export interface EmbedResult {
  embeds: Embed[];
  sources: Array<{ path: SourcePath; destinations: DestinationPath[] }>;
  destinations: Array<{ path: DestinationPath; sources: SourcePath[] }>;
}
