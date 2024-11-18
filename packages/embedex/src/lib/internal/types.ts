import { type ExamplePath, type TargetPath } from "../types";

export interface Example {
  content: string;
  targets: TargetPath[];
}
export type ExampleMap = Map<ExamplePath, Example>;

interface Target {
  content: string;
  examples: Set<ExamplePath>;
}
export type TargetMap = Map<TargetPath, Target>;
