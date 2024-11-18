export type ExamplePath = string;
export type TargetPath = string;

export interface EmbedParams {
  globPattern: string;
  root: string;
  write: boolean;
}

export type Code = "NO_CHANGE" | "NO_MATCH" | "UPDATED";

export interface Result {
  code: Code;
  paths: {
    target: TargetPath;
    examples: ExamplePath[];
  };
}

export type NoMatch = Result & { code: "NO_MATCH" };
export type NoChange = Result & { code: "NO_CHANGE" };
export type Updated = Result & { code: "UPDATED"; updatedContent: string };
export type EmbedResult = NoMatch | Updated | NoChange;
