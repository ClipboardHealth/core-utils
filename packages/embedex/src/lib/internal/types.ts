import { type ExamplePath, type TargetPath } from "../types";

export interface Example {
  targets: TargetPath[];
  content: string;
}
export type ExampleMap = Map<ExamplePath, Example>;

interface Target {
  content: string;
  examples: Set<ExamplePath>;
}
export type TargetMap = Map<TargetPath, Target>;
