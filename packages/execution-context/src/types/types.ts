export type Metadata = Record<string, unknown>;

export interface ExecutionContext {
  /**
   * The class/file/service that originated the thread that owns this context
   */
  source: string;
  /**
   * Additional contextual information associated with this execution context
   */
  metadata: Metadata;
}
