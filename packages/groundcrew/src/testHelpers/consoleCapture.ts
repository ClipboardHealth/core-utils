export interface ConsoleCapture {
  readonly calls: readonly (readonly string[])[];
  output(): string;
  restore(): void;
}

type ConsoleWriterMethod = "error" | "log";

function stringifyConsoleArgument(argument: unknown): string {
  return typeof argument === "string" ? argument : String(argument);
}

function captureConsoleWriter(method: ConsoleWriterMethod): ConsoleCapture {
  const calls: string[][] = [];
  const spy = vi.spyOn(console, method).mockImplementation((...arguments_: unknown[]) => {
    calls.push(arguments_.map(stringifyConsoleArgument));
  });

  return {
    calls,
    output: () => calls.map((call) => call.join(" ")).join("\n"),
    restore: () => {
      spy.mockRestore();
    },
  };
}

export function captureConsoleLog(): ConsoleCapture {
  return captureConsoleWriter("log");
}

export function captureConsoleError(): ConsoleCapture {
  return captureConsoleWriter("error");
}

export function captureConsoleClear(): ConsoleCapture {
  const spy = vi.spyOn(console, "clear").mockReturnValue();

  return {
    get calls() {
      return spy.mock.calls;
    },
    output: () => spy.mock.calls.map((call) => call.join(" ")).join("\n"),
    restore: () => {
      spy.mockRestore();
    },
  };
}
