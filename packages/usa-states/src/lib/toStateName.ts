import { isDefined } from "@clipboard-health/util-ts";

import { toStateCode } from "./toStateCode";
import { type StateCode, type StateName, US_STATES } from "./usStates";

const STATE_NAME_BY_CODE: ReadonlyMap<StateCode, StateName> = new Map(
  US_STATES.map((state) => [state.code, state.name]),
);

export interface ToStateNameInput {
  /** A state name (e.g. "California") or 2-letter code (e.g. "CA"). */
  value: string;
}

/**
 * Maps a state name or code to its canonical {@link StateName}, case-insensitive
 * and whitespace-insensitive (surrounding trimmed, interior runs collapsed).
 * Returns `undefined` for unrecognized values.
 */
export function toStateName(input: ToStateNameInput): StateName | undefined {
  const { value } = input;

  const code = toStateCode({ value });

  return isDefined(code) ? STATE_NAME_BY_CODE.get(code) : undefined;
}
