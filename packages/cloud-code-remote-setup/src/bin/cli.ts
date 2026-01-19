#!/usr/bin/env node
import { setup } from "../lib";

async function main(): Promise<void> {
  const result = await setup();

  if (result.isRight) {
    console.log(result.right.message);
  } else {
    console.error(`Error [${result.left.code}]: ${result.left.message}`);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
