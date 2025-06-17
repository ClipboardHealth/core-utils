import { type AsyncLocalStorage } from "node:async_hooks";

import { type ExecutionContext } from "./types";

declare global {
  var threadLocalStorage: AsyncLocalStorage<ExecutionContext>;
}
