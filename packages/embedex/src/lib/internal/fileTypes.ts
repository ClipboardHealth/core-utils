import { extname } from "node:path";

const SUPPORTED_FILE_EXTENSIONS = ["cts", "md", "mdx", "mts", "ts", "tsx"] as const;
export type SupportedFileExtension = (typeof SUPPORTED_FILE_EXTENSIONS)[number];

type FileExtension = string;

export function getFileExtension(path: string): FileExtension {
  return extname(path).slice(1);
}

export function isSupportedFileExtension(
  fileExtension: FileExtension,
): fileExtension is SupportedFileExtension {
  return SUPPORTED_FILE_EXTENSIONS.includes(fileExtension as SupportedFileExtension);
}
