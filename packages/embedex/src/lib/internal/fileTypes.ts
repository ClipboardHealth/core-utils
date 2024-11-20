import { extname } from "node:path";

export type FileExtension = string;

export function getFileExtension(path: string): FileExtension {
  return extname(path).slice(1);
}
