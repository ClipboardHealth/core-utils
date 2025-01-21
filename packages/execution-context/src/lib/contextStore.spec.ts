import {
  addMetadataToLocalContext,
  addToMetadataList,
  addToMetadataRecord,
  getExecutionContext,
  newExecutionContext,
  runWithExecutionContext,
} from "./contextStore";

const addMetadataIfContextIsPresent = () => {
  addMetadataToLocalContext({
    key1: "value1",
    key2: "value2",
  });
  addToMetadataList("list", { listKey: "listValue" });
  addToMetadataList("list", { listKey: "listValue" });
  addToMetadataRecord("record", { recordKey1: "recordValue1" });
  addToMetadataRecord("record", { recordKey2: "recordValue2" });
};

describe("Context Store", () => {
  it("should create a context that lives throughout the execution of a thread", async () => {
    await runWithExecutionContext(newExecutionContext("test"), async () => {
      addMetadataIfContextIsPresent();
      const context = getExecutionContext();

      expect(context?.metadata).toEqual({
        key1: "value1",
        key2: "value2",
        list: [{ listKey: "listValue" }, { listKey: "listValue" }],
        record: { recordKey1: "recordValue1", recordKey2: "recordValue2" },
      });
    });
  });

  it("should not add anything but should not throw an error if there is no context", () => {
    addMetadataIfContextIsPresent();
    const context = getExecutionContext();
    expect(context).toBeUndefined();
  });

  it("should throw exception if the underlying function throws one", async () => {
    await expect(
      runWithExecutionContext(newExecutionContext("test"), async () => {
        throw new Error("testing asynchronous error");
      }),
    ).rejects.toThrow("testing asynchronous error");
  });

  it("should throw exception if the underlying function throws a synchronous error", async () => {
    await expect(
      runWithExecutionContext(newExecutionContext("test"), () => {
        throw new Error("testing synchronous error");
      }),
    ).rejects.toThrow("testing synchronous error");
  });
});
