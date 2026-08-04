import { isDefined } from "@clipboard-health/util-ts";

import { isStateCode } from "./isStateCode";
import { type StateCode, US_STATES } from "./usStates";

const STATE_CODE_BY_NORMALIZED_NAME: ReadonlyMap<string, StateCode> = new Map(
  US_STATES.map((state) => [normalize(state.name), state.code]),
);

export interface ToStateCodeInput {
  /** A state name (e.g. "California") or 2-letter code (e.g. "CA"). */
  value: string;
}

/**
 * Maps a state name or code to its canonical {@link StateCode}, case-insensitive
 * and whitespace-insensitive (surrounding trimmed, interior runs collapsed).
 * Returns `undefined` for unrecognized values.
 */
export function toStateCode(input: ToStateCodeInput): StateCode | undefined {
  const { value } = input;

  const code = value.trim().toUpperCase();
  if (isStateCode(code)) {
    return code;
  }

  return STATE_CODE_BY_NORMALIZED_NAME.get(normalize(value));
}

export interface ToStateCodeSetInput {
  /** State names or 2-letter codes to normalize. */
  values: readonly string[];
}

/**
 * Maps a list of state names or codes to a `Set` of canonical {@link StateCode}s,
 * dropping unrecognized values.
 */
export function toStateCodeSet(input: ToStateCodeSetInput): Set<StateCode> {
  const { values } = input;

  return new Set(values.map((value) => toStateCode({ value })).filter(isDefined));
}

function normalize(value: string): string {
  return value.trim().replaceAll(/\s+/gu, " ").toLowerCase();
}
