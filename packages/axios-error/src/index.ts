// Main API
export {
  AxiosError,
  extractMessage,
  extractUserMessage,
  getHttpStatus,
  integrations,
  isAxiosError,
  isRetryable,
  presets,
} from "./lib/api";

// Types
export type {
  AbortError,
  AxiosErrorDetails,
  AxiosInternalCode,
  CodeExtractor,
  ConfigurationError,
  EnhancedAxiosError,
  ExtractionConfig,
  MessageExtractor,
  NetworkError,
  NetworkErrorCode,
  ParseError,
  ResponseError,
  Result,
  TimeoutError,
  UnknownError,
} from "./lib/types";

// Built-in extractors (for advanced usage)
export { builtInCodeExtractors, builtInMessageExtractors } from "./lib/extractor";

// Direct access to classification (for advanced usage)
export { classifyAxiosError } from "./lib/classifier";
