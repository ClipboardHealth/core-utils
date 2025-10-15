import type { HandlerInterface } from "../handler";
import { HandlerAlreadyRegisteredError } from "./handlerAlreadyRegisteredError";

type InstantiableHandlerClass<T> = new () => HandlerInterface<T>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyHandlerClass<T> = new (...arguments_: any) => HandlerInterface<T>;
export type InstantiableHandlerClassOrInstance<T> =
  | InstantiableHandlerClass<T>
  | HandlerInterface<T>;
export type AnyHandlerClassOrInstance<T> = AnyHandlerClass<T> | HandlerInterface<T>;

export interface RegisteredHandlerType<T> {
  group: string;
  queue: string;
  handler: HandlerInterface<T>;
}

function isHandlerInstance<T>(handler: unknown): handler is HandlerInterface<T> {
  return (handler as HandlerInterface<T>).perform !== undefined;
}

function getHandlerClass<T>(handler: AnyHandlerClassOrInstance<T>): AnyHandlerClass<T> {
  return isHandlerInstance(handler) ? (handler.constructor as AnyHandlerClass<T>) : handler;
}

function getHandlerInstance<T>(
  handler: InstantiableHandlerClassOrInstance<T>,
): HandlerInterface<T> {
  // eslint-disable-next-line new-cap
  return isHandlerInstance(handler) ? handler : new handler();
}

interface ConstructorOptions {
  allowHandlerOverride: boolean | undefined;
}

export class Registry {
  private readonly handlers = new Map<string, RegisteredHandlerType<unknown>>();
  private readonly names = new Map<AnyHandlerClass<unknown>, string>();
  private readonly queues = new Set<string>();
  private readonly queueGroups = new Map<string, Set<string>>();
  private readonly allowHandlerOverride: boolean;

  constructor(options: ConstructorOptions) {
    this.allowHandlerOverride = options.allowHandlerOverride ?? false;
  }

  public register<T>(
    handlerClassOrInstance: InstantiableHandlerClassOrInstance<T>,
    group: string,
  ): void {
    const handler = getHandlerInstance(handlerClassOrInstance);
    const handlerName = handler.name;
    const queue = handlerName;

    if (!this.allowHandlerOverride && this.handlers.has(handlerName)) {
      throw new HandlerAlreadyRegisteredError(`${handlerName} already registered`);
    }

    this.handlers.set(handlerName, { group, handler, queue });
    this.names.set(handler.constructor as AnyHandlerClass<unknown>, handlerName);
    this.queues.add(queue);

    const queueGroup = this.queueGroups.get(group);

    if (queueGroup) {
      queueGroup.add(queue);
    } else {
      const newQueueGroup = new Set<string>();
      newQueueGroup.add(queue);
      this.queueGroups.set(group, newQueueGroup);
    }
  }

  public getRegisteredHandler(
    handler: string | AnyHandlerClassOrInstance<unknown>,
  ): RegisteredHandlerType<unknown> {
    const handlerName = this.getHandlerName(handler);
    const registeredHandler = this.handlers.get(handlerName);

    if (registeredHandler === undefined) {
      throw new Error(`No handler registered for ${handlerName}`);
    }

    return registeredHandler;
  }

  public getQueues() {
    return [...this.queues];
  }

  public getQueuesForGroups(groups: string[]): string[] {
    let result = new Array<string>();

    for (const group of groups) {
      const queuesInGroup = this.queueGroups.get(group);
      if (queuesInGroup) {
        result = [...result, ...queuesInGroup];
      }
    }

    return result;
  }

  private getHandlerName(handler: string | AnyHandlerClassOrInstance<unknown>): string {
    if (typeof handler === "string") {
      return handler;
    }

    const handlerClass = getHandlerClass(handler);
    const name = this.names.get(handlerClass);

    if (name === undefined) {
      throw new Error(`No handler registered for ${handlerClass.toString()}`);
    }

    return name;
  }
}
