export type ExamplePath = string;
export type TargetPath = string;

export interface EmbedParams {
  cwd: string;
  examplesGlob: string;
  write: boolean;
}

export type Code = "NO_CHANGE" | "NO_MATCH" | "UNSUPPORTED" | "UPDATE";

export interface Result {
  code: Code;
  paths: {
    examples: ExamplePath[];
    target: TargetPath;
  };
}

export type NoMatch = Result & { code: "NO_MATCH" };
export type NoChange = Result & { code: "NO_CHANGE" };
export type Unsupported = Result & { code: "UNSUPPORTED" };
export type Updated = Result & { code: "UPDATE"; updatedContent: string };
export type Embed = NoMatch | Updated | NoChange | Unsupported;

export interface EmbedResult {
  embeds: Embed[];
  examples: Array<{ path: ExamplePath; targets: TargetPath[] }>;
  targets: Array<{ path: TargetPath; examples: ExamplePath[] }>;
}
