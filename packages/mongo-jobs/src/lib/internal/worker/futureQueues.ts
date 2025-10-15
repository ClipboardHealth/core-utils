export class FutureQueues {
  private readonly actionableSoon = new Map<string, Date>();

  setActionableAt(queue: string, actionableAt: Date): void {
    const oldActionableAt = this.actionableSoon.get(queue);

    if (oldActionableAt && oldActionableAt < actionableAt) {
      return;
    }

    this.actionableSoon.set(queue, actionableAt);
  }

  acquireCurrentlyActionable(): string[] {
    const actionableQueues = new Array<string>();
    const now = new Date();

    this.actionableSoon.forEach((actionableAt, queue) => {
      if (actionableAt > now) {
        return;
      }

      actionableQueues.push(queue);
      this.actionableSoon.delete(queue);
    });

    return actionableQueues;
  }
}
