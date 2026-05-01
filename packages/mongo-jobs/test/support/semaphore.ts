import { isDefined } from "@clipboard-health/util-ts";

interface PromiseEntry {
  promise?: Promise<void>;
  // oxlint-disable-next-line typescript/no-invalid-void-type
  resolve?: (value: void) => void;
}

export class Semaphore {
  private readonly promises = new Map<string | number, PromiseEntry>();

  public setNewPromise(index: string | number) {
    const entry: PromiseEntry = {};

    entry.promise = new Promise((resolve) => {
      entry.resolve = resolve;
    });
    this.promises.set(index, entry);
  }

  public resolvePromise(index: string | number) {
    const resolve = this.promises.get(index)?.resolve;
    if (resolve) {
      resolve();
      this.promises.delete(index);
    }
  }

  public async getPromise(index: string | number) {
    return await this.promises.get(index)?.promise;
  }

  public cleanup(): void {
    // Resolve pending promises
    [...this.promises.values()]
      .filter((entry): entry is Required<PromiseEntry> => isDefined(entry.resolve))
      .forEach((entry) => {
        entry.resolve();
      });

    this.promises.clear();
  }
}
