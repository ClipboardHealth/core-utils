import { AsyncLocalStorage } from "node:async_hooks";

import { type ExecutionContext } from "../types/types";

globalThis.threadLocalStorage ||= new AsyncLocalStorage();

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class ContextStore {
  static getStorage(): AsyncLocalStorage<ExecutionContext> {
    return globalThis.threadLocalStorage;
  }

  public static getContext(): ExecutionContext | undefined {
    return ContextStore.getStorage().getStore();
  }

  /**
   * This is the function that essentially wraps a call with a context object.
   *
   * If you want to make use of this thread-local context then wrap your function call with
   * `withContext` and within it you'll be able to use the `ContextStore` and its utility functions
   *
   * @param context - The context object that will be accessible anywhere in the execution.
   * @param function_ - The function that will have a context available to it.
   */
  public static async withContext<T = void>(
    context: ExecutionContext,
    function_: () => Promise<T>,
  ): Promise<T> {
    return await new Promise((resolve, reject) => {
      ContextStore.getStorage().run(context, () => {
        function_().then(resolve).catch(reject);
      });
    });
  }
}

/**
 * This function is simply a convenience to initialize an empty context object
 * @param source - The class/service that initializes the context
 */
export function newExecutionContext(source: string): ExecutionContext {
  return {
    source,
    metadata: {},
  };
}

/**
 * A utility function that will add metadata to the current context
 * @param metadata - the metadata (key-value pair), to be added to the context
 */
export function addMetadataToLocalContext(metadata: Record<string, unknown>): void {
  const context = ContextStore.getContext();
  if (context) {
    context.metadata = { ...context.metadata, ...metadata };
  }
}

function getMetadataListByKey(key: string): unknown[] {
  const context = ContextStore.getContext();
  if (context?.metadata && key in context.metadata) {
    const metadataForKey = context.metadata[key];
    if (Array.isArray(metadataForKey)) {
      return metadataForKey;
    }
  }

  return [];
}

export function addToMetadataList(key: string, metadata: Record<string, unknown>): void {
  const metadataList = [...getMetadataListByKey(key), metadata];
  addMetadataToLocalContext({ [key]: metadataList });
}
