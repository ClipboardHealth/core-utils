import { type StateCode, US_STATES } from "./usStates";

const STATE_CODES: ReadonlySet<string> = new Set(US_STATES.map((state) => state.code));

export function isStateCode(value: string): value is StateCode {
  return STATE_CODES.has(value);
}
