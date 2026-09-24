import { isDefined, isNil } from "@clipboard-health/util-ts";

import { STATE_TIME_ZONES } from "./stateTimeZones";
import { toStateCode } from "./toStateCode";

export interface GetStateTimeZonesInput {
  /** State name (e.g. "Tennessee") or 2-letter code (e.g. "TN"). */
  state?: string;
}

/**
 * Returns the complete, frozen list of representative IANA zones in policy order
 * after applying the existing state normalizer. Omitted, blank, `Any`, and
 * unrecognized states return a frozen empty array. Selection is left to callers.
 */
export function getStateTimeZones(input: GetStateTimeZonesInput): readonly string[] {
  const { state } = input;
  const code = isNil(state) ? undefined : toStateCode({ value: state });

  return isDefined(code) ? STATE_TIME_ZONES[code] : EMPTY_TIME_ZONES;
}

const EMPTY_TIME_ZONES: readonly string[] = Object.freeze([]);
