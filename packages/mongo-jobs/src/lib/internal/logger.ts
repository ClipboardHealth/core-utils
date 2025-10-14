export interface Logger {
  info: (...arguments_: unknown[]) => void;
  error: (...arguments_: unknown[]) => void;
}
