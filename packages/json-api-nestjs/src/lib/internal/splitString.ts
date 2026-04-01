export function splitString(value: unknown) {
  return typeof value === "string" ? value.split(",") : value;
}

export function wrapString(value: unknown) {
  return typeof value === "string" ? [value] : value;
}
