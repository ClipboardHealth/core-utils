import { type AsyncLocalStorage } from "node:async_hooks";

import { type ExecutionContext } from "./types";

declare global {
  // eslint-disable-next-line no-var
  var threadLocalStorage: AsyncLocalStorage<ExecutionContext>;
}
