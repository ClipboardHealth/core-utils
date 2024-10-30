/**
 * This interface contains the common attributes that we often want to know about
 * in any execution within our domain.
 */
interface KnownMetadata {
  /**
   * the id of the shift being referenced in the execution
   */
  shiftId?: string;

  /**
   * @deprecated use `workerId` instead.
   */
  agentId?: string;

  /**
   * the id of the worker being referenced in the execution
   */
  workerId?: string;

  /**
   * @deprecated use `workplaceId` instead.
   */
  facilityId?: string;

  /**
   * the id of the workplace being referenced in the execution
   */
  workplaceId?: string;
}

export type Metadata = KnownMetadata & Record<string, unknown>;

export interface ExecutionContext {
  /**
   * the class/file/service that originated the thread that owns this context
   */
  source: string;
  /**
   * Additional contextual information associated with this execution context
   */
  metadata: Metadata;
}
