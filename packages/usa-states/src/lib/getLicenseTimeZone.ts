import { isDefined, isNil, type ServiceResult, success } from "@clipboard-health/util-ts";

import { STATE_TIME_ZONES } from "./stateTimeZones";
import { toStateCode } from "./toStateCode";

export interface GetLicenseTimeZoneInput {
  /** Issuing state name or code, independent of worker location and multistate coverage. */
  state?: string | null | undefined;
}

export interface GetLicenseTimeZoneOutput {
  /** Undefined when the issuing state has no policy; persistence can represent this as null. */
  licenseTimeZone: string | undefined;
}

/**
 * Selects the first policy zone after applying the existing state normalizer.
 * Missing, `Any`, and unrecognized states successfully resolve to no timezone.
 * Does not choose a display fallback or convert an expiration timestamp.
 */
export function getLicenseTimeZone(
  input: GetLicenseTimeZoneInput,
): ServiceResult<GetLicenseTimeZoneOutput> {
  const { state } = input;
  const code = isNil(state) ? undefined : toStateCode({ value: state });

  return success({
    licenseTimeZone: isDefined(code) ? STATE_TIME_ZONES[code][0] : undefined,
  });
}
