// Error.stack includes the message plus call-site context, which makes sync failures actionable.
export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}
