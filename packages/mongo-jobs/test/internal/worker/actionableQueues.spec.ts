import { ActionableQueues } from "../../../src/lib/internal/worker/actionableQueues";

describe("ActionableQueues", () => {
  let actionableQueues: ActionableQueues;

  beforeEach(() => {
    actionableQueues = new ActionableQueues();
  });

  it("when 1 queue is added then getRandom will return that queue", () => {
    const queue = "myQueue";
    actionableQueues.add(queue);

    expect(actionableQueues.getRandom()).toBe(queue);
  });

  it("when queue is added and then removed then getRandom will return undefined", () => {
    const queue = "myQueue";
    actionableQueues.add(queue);
    actionableQueues.remove(queue);

    expect(actionableQueues.getRandom()).toBeUndefined();
  });

  it("when queue is added multiple times and then removed once then as a result we get undefined on getRandom", () => {
    const queue = "myQueue";
    actionableQueues.add(queue);
    // eslint-disable-next-line sonarjs/no-element-overwrite
    actionableQueues.add(queue);
    // eslint-disable-next-line sonarjs/no-element-overwrite
    actionableQueues.add(queue);
    actionableQueues.remove(queue);

    expect(actionableQueues.getRandom()).toBeUndefined();
  });

  it("will return proper queue in a complex add and remove scenario", () => {
    const queue1 = "queue1";
    const queue2 = "queue2";
    const queue3 = "queue3";

    // Queue1
    actionableQueues.add(queue1);
    // Queue1, queue2
    actionableQueues.add(queue2);
    // Queue1, queue2, queue3

    actionableQueues.add(queue3);
    // Queue1, queue2, queue3
    // eslint-disable-next-line sonarjs/no-element-overwrite
    actionableQueues.add(queue1);
    // Queue1, queue2
    actionableQueues.remove(queue3);
    // Queue1, queue2
    actionableQueues.remove(queue3);
    // Queue1, queue2, queue3
    actionableQueues.add(queue3);
    // Queue1, queue2, queue3
    actionableQueues.add(queue2);
    // Queue1, queue3
    actionableQueues.remove(queue2);
    // Queue3
    actionableQueues.remove(queue1);

    expect(actionableQueues.getRandom()).toBe(queue3);
  });
});
