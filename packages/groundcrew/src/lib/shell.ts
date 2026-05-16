/**
 * Single-quote `value` for safe shell embedding. Embedded single quotes
 * are closed, escaped, and reopened — `'foo'\''bar'` is "foo'bar" in
 * shell.
 */
export function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", String.raw`'\''`)}'`;
}
