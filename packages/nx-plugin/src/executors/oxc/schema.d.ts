export interface OxcExecutorSchema {
  assets: Array<string | { input: string; glob: string; output: string }>;
  main: string;
  outputPath: string;
  tsConfig: string;
}
