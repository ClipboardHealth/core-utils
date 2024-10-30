# @clipboard-health/execution-context <!-- omit from toc -->

`ExecutionContext` is a lightweight Node.js package built with TypeScript that leverages `AsyncLocalStorage` to create a statically available context parallel to any execution. It provides a reliable, thread-safe context for attaching and accessing metadata throughout the lifecycle of an execution, such as API requests, background jobs, or message consumers. This allows various parts of your application to communicate and share metadata without needing to explicitly pass context objects.

### Features

- **Scoped Contexts**: Attach data to a context that is specific to each execution scope.
- **Static Access**: Access context data statically anywhere in the codebase within an active execution.
- **Metadata Aggregation**: Store and retrieve metadata across the lifespan of an execution, ideal for logging, tracing, and other observability tasks.

## Table of Contents <!-- omit from toc -->

- [Install](#install)
- [Usage](#usage)
- [Local development commands](#local-development-commands)

## Install

```bash
npm install @clipboard-health/execution-context
```

## Usage

This example demonstrates how to create a logging context, accumulate metadata from various function calls, and then log a single message containing all the gathered metadata.

```typescript
import {
  ContextStore,
  newExecutionContext,
  addMetadataToLocalContext,
} from "@clipboard-health/execution-context";

async function processRequest() {
  // Start a logging context for this request
  await ContextStore.withContext(newExecutionContext("context-name"), async () => {
    const context = ContextStore.getContext();

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
      addMetadataToLocalContext({ errorMessage: error.message });
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
```

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
