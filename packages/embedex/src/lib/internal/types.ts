import { type ExamplePath, type TargetPath } from "../types";

export interface Example {
  content: string;
  targets: TargetPath[];
}
export type ExampleMap = ReadonlyMap<ExamplePath, Example>;

export interface Target {
  content: string;
  examples: ReadonlySet<ExamplePath>;
}
export type TargetMap = ReadonlyMap<TargetPath, Target>;
