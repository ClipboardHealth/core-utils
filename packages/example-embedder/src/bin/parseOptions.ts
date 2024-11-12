interface CliOptions {
  check: boolean;
  directory: string;
}

const DEFAULTS: CliOptions = {
  check: false,
  directory: "examples",
};

export function parseOptions(): CliOptions {
  const check = process.argv.includes("--check") ?? DEFAULTS.check;
  const rest = process.argv.filter((argument) => argument !== "--check");

  return {
    check,
    directory: rest[2] ?? DEFAULTS.directory,
  };
}
