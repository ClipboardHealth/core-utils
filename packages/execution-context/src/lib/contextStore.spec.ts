import {
  addMetadataToLocalContext,
  addToMetadataList,
  ContextStore,
  newExecutionContext,
} from "./contextStore";

const addMetadataIfContextIsPresent = () => {
  addMetadataToLocalContext({
    key1: "value1",
    key2: "value2",
  });
  addToMetadataList("list", { listKey: "listValue" });
  addToMetadataList("list", { listKey: "listValue" });
};

describe("Context Store", () => {
  it("should create a context that lives throughout the execution of a thread", async () => {
    await ContextStore.withContext(newExecutionContext("test"), async () => {
      addMetadataIfContextIsPresent();
      const context = ContextStore.getContext();

      expect(context?.metadata).toEqual({
        key1: "value1",
        key2: "value2",
        list: [{ listKey: "listValue" }, { listKey: "listValue" }],
      });
    });
  });

  it("should not add anything but should not throw an error if there is no context", () => {
    addMetadataIfContextIsPresent();
    const context = ContextStore.getContext();
    expect(context).toBeUndefined();
  });

  it("should throw exception if the underlying function throws one", async () => {
    await expect(
      ContextStore.withContext(newExecutionContext("test"), async () => {
        throw new Error("testing error");
      }),
    ).rejects.toThrow("testing error");
  });
});
