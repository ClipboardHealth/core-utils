export type LogFunction = (...params: unknown[]) => void;

/**
 * Logger interface for structured logging operations.
 */
export interface Logger {
  info: LogFunction;
  warn: LogFunction;
  error: LogFunction;
}
