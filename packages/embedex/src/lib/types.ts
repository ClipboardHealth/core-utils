export type ExamplePath = string;
export type TargetPath = string;

export interface EmbedParams {
  examplesGlob: string;
  cwd: string;
  write: boolean;
}

export type Code = "NO_CHANGE" | "NO_MATCH" | "UPDATE";

export interface Result {
  code: Code;
  paths: {
    target: TargetPath;
    examples: ExamplePath[];
  };
}

export type NoMatch = Result & { code: "NO_MATCH" };
export type NoChange = Result & { code: "NO_CHANGE" };
export type Updated = Result & { code: "UPDATE"; updatedContent: string };
export type Embed = NoMatch | Updated | NoChange;

export interface EmbedResult {
  embeds: Embed[];
  examples: Array<{ path: ExamplePath; targets: TargetPath[] }>;
  targets: Array<{ path: TargetPath; examples: ExamplePath[] }>;
}
