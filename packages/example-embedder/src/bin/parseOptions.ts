interface CliOptions {
  check: boolean;
  directory: string;
}

const DEFAULTS = {
  directory: "examples",
};

export function parseOptions(): CliOptions {
  const { directory } = DEFAULTS;
  const directoryIndex = process.argv.indexOf("--directory");

  return {
    check: process.argv.includes("--check"),
    directory: directoryIndex === -1 ? directory : (process.argv[directoryIndex + 1] ?? directory),
  };
}
