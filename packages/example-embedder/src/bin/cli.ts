import { embedder } from "..";
import { parseOptions } from "./parseOptions";

async function cli(): Promise<void> {
  const { check, directory } = parseOptions();

  await embedder({
    check,
    directory,
  }).catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    // eslint-disable-next-line n/no-process-exit, unicorn/no-process-exit
    process.exit(1);
  });
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void cli();
