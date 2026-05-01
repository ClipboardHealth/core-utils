export class ActionableQueues {
  private readonly set = new Set<string>();
  private readonly array = new Array<string>();

  public add(queue: string) {
    if (this.set.has(queue)) {
      return;
    }

    this.set.add(queue);
    this.array.push(queue);
  }

  public remove(queue: string) {
    if (!this.set.has(queue)) {
      return;
    }

    this.set.delete(queue);

    const indexOfQueue = this.array.indexOf(queue);
    this.array.splice(indexOfQueue, 1);
  }

  public getRandom(): string | undefined {
    const arrayLength = this.array.length;
    if (arrayLength === 0) {
      return undefined;
    }

    return this.array[Math.floor(Math.random() * arrayLength)];
  }
}
