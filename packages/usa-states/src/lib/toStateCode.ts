import { isDefined } from "@clipboard-health/util-ts";

import { isStateCode } from "./isStateCode";
import { type StateCode, US_STATES } from "./usStates";

const STATE_CODE_BY_NORMALIZED_NAME: ReadonlyMap<string, StateCode> = new Map(
  US_STATES.map((state) => [normalize(state.name), state.code]),
);

/**
 * Maps a state name or code to its canonical {@link StateCode}, case-insensitive
 * and whitespace-insensitive (surrounding trimmed, interior runs collapsed).
 * Returns `undefined` for unrecognized values.
 */
export function toStateCode(value: string): StateCode | undefined {
  const code = value.trim().toUpperCase();
  if (isStateCode(code)) {
    return code;
  }

  return STATE_CODE_BY_NORMALIZED_NAME.get(normalize(value));
}

/**
 * Maps a list of state names or codes to a `Set` of canonical {@link StateCode}s,
 * dropping unrecognized values.
 */
export function toStateCodeSet(values: readonly string[]): Set<StateCode> {
  return new Set(values.map((value) => toStateCode(value)).filter(isDefined));
}

function normalize(value: string): string {
  return value.trim().replaceAll(/\s+/gu, " ").toLowerCase();
}
