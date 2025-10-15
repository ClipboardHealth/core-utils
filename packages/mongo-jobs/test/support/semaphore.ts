import { isDefined } from "@clipboard-health/util-ts";

interface PromiseEntry {
  promise?: Promise<void>;
  resolve?: (value: void) => void;
}

export class Semaphore {
  private readonly promises = new Map<string | number, PromiseEntry>();

  setNewPromise(index: string | number) {
    const entry: PromiseEntry = {};

    entry.promise = new Promise((resolve) => {
      entry.resolve = resolve;
    });
    this.promises.set(index, entry);
  }

  resolvePromise(index: string | number) {
    const resolve = this.promises.get(index)?.resolve;
    if (resolve) {
      resolve();
      this.promises.delete(index);
    }
  }

  async getPromise(index: string | number) {
    return await this.promises.get(index)?.promise;
  }

  cleanup(): void {
    // Resolve pending promises
    [...this.promises.values()]
      .filter((entry): entry is Required<PromiseEntry> => isDefined(entry.resolve))
      .forEach((entry) => {
        entry.resolve();
      });

    this.promises.clear();
  }
}
