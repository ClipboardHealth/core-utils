import "../types/global";

import { AsyncLocalStorage } from "node:async_hooks";

import { type ExecutionContext } from "../types/types";
import { isRecord } from "./util";

globalThis.threadLocalStorage ||= new AsyncLocalStorage();

function getAsyncLocalStorage(): AsyncLocalStorage<ExecutionContext> {
  return globalThis.threadLocalStorage;
}

export function getExecutionContext(): ExecutionContext | undefined {
  return getAsyncLocalStorage().getStore();
}

export async function runWithExecutionContext<T = void>(
  context: ExecutionContext,
  callback: () => Promise<T>,
): Promise<T> {
  return await new Promise((resolve, reject) => {
    getAsyncLocalStorage().run(context, () => {
      try {
        Promise.resolve(callback()).then(resolve).catch(reject);
      } catch (error) {
        reject(error);
      }
    });
  });
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
  const context = getExecutionContext();
  if (context) {
    context.metadata = { ...context.metadata, ...metadata };
  }
}

function getMetadataListByKey(key: string): unknown[] {
  const context = getExecutionContext();
  if (context?.metadata && key in context.metadata) {
    const metadataForKey = context.metadata[key];
    if (Array.isArray(metadataForKey)) {
      return metadataForKey;
    }
  }

  return [];
}

/**
 * A utility function that will add metadata to the list under current context's key
 * @param key - the list's key (string) in the context
 * @param metadata - the metadata (key-value pair), to be added to the context
 */
export function addToMetadataList(key: string, metadata: Record<string, unknown>): void {
  const metadataList = [...getMetadataListByKey(key), metadata];
  addMetadataToLocalContext({ [key]: metadataList });
}

function getMetadataRecordByKey(key: string): Record<string, unknown> {
  const context = getExecutionContext();
  if (context?.metadata && key in context.metadata) {
    const metadataForKey = context.metadata[key];
    if (isRecord(metadataForKey)) {
      return metadataForKey;
    }
  }

  return {};
}

/**
 * A utility function that will add metadata to the record under current context's key,
 * supporting nested records.
 * @param key - the record's key (string) in the context
 * @param metadata - the metadata (key-value pair), to be added to the context
 */
export function addToMetadataRecord(key: string, metadata: Record<string, unknown>): void {
  const metadataRecord = { ...getMetadataRecordByKey(key), ...metadata };
  addMetadataToLocalContext({ [key]: metadataRecord });
}
