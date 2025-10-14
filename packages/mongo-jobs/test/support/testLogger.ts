interface LogEntry {
  message: string;
  context: Record<string, unknown>;
}

export class TestLogger {
  public infoLogs = new Array<LogEntry>();
  public errorLogs = new Array<LogEntry>();

  public info(...arguments_: unknown[]) {
    this.infoLogs.push(this.argumentsToEntry(...arguments_));
  }

  public error(...arguments_: unknown[]) {
    this.errorLogs.push(this.argumentsToEntry(...arguments_));
  }

  private argumentsToEntry(...arguments_: unknown[]) {
    const message = arguments_[0] as string;
    const context = arguments_[1] as Record<string, unknown>;

    return { message, context };
  }
}
