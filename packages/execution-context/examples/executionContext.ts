// packages/execution-context/README.md
import {
  addMetadataToLocalContext,
  getExecutionContext,
  newExecutionContext,
  runWithExecutionContext,
} from "@clipboard-health/execution-context";

export async function processRequest() {
  // Start a context for this request
  await runWithExecutionContext(newExecutionContext("context-name"), async () => {
    const context = getExecutionContext();

    try {
      // Add metadata from the current function
      addMetadataToLocalContext({ userId: "1" });

      // Simulate calling other functions that add their own context metadata
      callFunctionThatAddsContext();
      callFunctionThatCallsAnotherFunctionThatAddsContext();

      // Log the successful processing event with accumulated metadata
      console.log("event=MessageProcessed", { ...context?.metadata });
    } catch (error) {
      // Capture and log error metadata if something goes wrong
      addMetadataToLocalContext({ error });
      console.error("event=MessageProcessed", { ...context?.metadata });
    }
  });
}

// Example function that adds its own metadata to the current context
function callFunctionThatAddsContext() {
  addMetadataToLocalContext({ operation: "dataFetch", status: "success" });
}

// Example function that calls another function, both adding their own metadata
function callFunctionThatCallsAnotherFunctionThatAddsContext() {
  addMetadataToLocalContext({ operation: "validate", validationStep: "pre-check" });
  callAnotherFunctionThatAddsContext();
}

function callAnotherFunctionThatAddsContext() {
  addMetadataToLocalContext({
    operation: "validate",
    validationStep: "post-check",
    result: "passed",
  });
}
