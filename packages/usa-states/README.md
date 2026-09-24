# @clipboard-health/usa-states <!-- omit from toc -->

Canonical US state and territory list, `StateCode` and `StateName` types, and name/code normalizers.

## Table of contents <!-- omit from toc -->

- [Install](#install)
- [Usage](#usage)
- [License timezone policy](#license-timezone-policy)
  - [Ordered choices and geographic exceptions](#ordered-choices-and-geographic-exceptions)
  - [Existing license processor conventions](#existing-license-processor-conventions)
- [Local development commands](#local-development-commands)

## Install

```bash
npm install @clipboard-health/usa-states
```

## Usage

```ts
import {
  isStateCode,
  type StateCode,
  type StateName,
  toStateCode,
  toStateCodeSet,
  toStateName,
  US_STATES,
} from "@clipboard-health/usa-states";

US_STATES.find((state) => state.code === "CA");
// => { name: "California", code: "CA" }

function parseStateCode(value: string): StateCode | undefined {
  return isStateCode(value) ? value : undefined;
}

// Normalize a state name or code (case- and whitespace-insensitive) to a `StateCode`.
toStateCode({ value: "  california " });
// => "CA"
toStateCode({ value: "Atlantis" });
// => undefined

// Normalize a list of names or codes to a `Set<StateCode>`, dropping unknown values.
toStateCodeSet({ values: ["California", "ny", "Atlantis"] });
// => Set { "CA", "NY" }

// Normalize a state name or code (case- and whitespace-insensitive) to a canonical `StateName`.
toStateName({ value: "  california " });
// => "California"
toStateName({ value: "ca" });
// => "California"
toStateName({ value: "Atlantis" });
// => undefined

interface LabelInput {
  name: StateName;
}

function toLabel(input: LabelInput): string {
  const { name } = input;

  return `Licensed in ${name}`;
}
```

Prefer storing `StateCode` and resolving to `StateName` only for display; codes are the stable
representation to compare across services. Both normalizers return `undefined` for unrecognized
input — treat that as a validation failure rather than falling back to the raw value, otherwise
unnormalized input reaches storage.

## License timezone policy

`STATE_TIME_ZONES` provides a frozen, nonempty list of representative IANA timezone names for
each supported `StateCode`. `getLicenseTimeZone` normalizes an issuing state using `toStateCode`
and selects the first entry. Existing state names/codes and `US_STATES` objects are unchanged.

```ts
import { getLicenseTimeZone, STATE_TIME_ZONES } from "@clipboard-health/usa-states";

STATE_TIME_ZONES.WA;
// => ["America/Los_Angeles"]
STATE_TIME_ZONES.TN;
// => ["America/New_York", "America/Chicago"]

const result = getLicenseTimeZone({ state: "  washington " });
if (result.isSuccess) {
  result.value.licenseTimeZone;
  // => "America/Los_Angeles"
}

const unknown = getLicenseTimeZone({ state: "Any" });
if (unknown.isSuccess) {
  unknown.value.licenseTimeZone;
  // => undefined
}
```

The helper follows the shared `ServiceResult` API convention. A missing (`null`, `undefined`, or
omitted), blank, `Any`, or unrecognized state successfully resolves to `licenseTimeZone: undefined`.
License Manager can persist that absence as `null`. No UTC or viewer-timezone fallback is selected
here; null presentation/input behavior must be decided by consumers consistently before rollout.
Resolving metadata does not change the stored state representation.

Use the **issuing state** even for compact/multistate licenses. Worker residence, physical location,
workplace state, and shift timezone do not select this metadata. Persist the selected zone on
creation and issuing-state changes; unrelated updates should preserve the existing snapshot.
Changing this shared policy does not authorize a historical backfill or a processor cutoff change.

This package supplies policy metadata only. Continue using `@clipboard-health/date-time` with an
explicit timezone for conversion and formatting. Preserve the UTC `expiresAt` instant: for example,
`2026-09-27T06:59:59Z` represents September 26 at 23:59:59 in Washington's
`America/Los_Angeles`, even when the viewer is in Georgia.

### Ordered choices and geographic exceptions

The first entry is the conservative application preference: the earlier expiration cutoff for the
same credential calendar day under current timezone rules. The order is stable and documented;
it is neither a population/capital preference nor a chain of fallbacks. Do not sort by today's UTC
offset or substitute fixed `PST`/`EST` offsets. Arizona's entries tie during standard time.

The lists represent current standard-time/DST regimes, not every historical IANA location or alias.
They do not guarantee chronological ordering for every historical date or claim that a licensing
registry has established a legal expiration hour. Existing timestamps retain their original meaning.

The 14 states spanning federal standard-time zones, plus Arizona's separate DST case, are:

| State        | Preferred IANA zone          | Other representative zone | Geographic basis                                         |
| ------------ | ---------------------------- | ------------------------- | -------------------------------------------------------- |
| Alaska       | America/Anchorage            | America/Adak              | Alaska and western Aleutians                             |
| Arizona      | America/Denver               | America/Phoenix           | Navajo DST observance and most of Arizona without DST    |
| Florida      | America/New_York             | America/Chicago           | Eastern and western Panhandle                            |
| Idaho        | America/Boise                | America/Los_Angeles       | Southern Mountain and northern Pacific                   |
| Indiana      | America/Indiana/Indianapolis | America/Chicago           | Eastern and Central counties                             |
| Kansas       | America/Chicago              | America/Denver            | Central and western Mountain counties                    |
| Kentucky     | America/New_York             | America/Chicago           | Eastern and Central areas                                |
| Michigan     | America/Detroit              | America/Menominee         | Eastern and western Upper Peninsula                      |
| Nebraska     | America/Chicago              | America/Denver            | Central and western Mountain areas                       |
| Nevada       | America/Denver               | America/Los_Angeles       | West Wendover's Mountain exception and Pacific remainder |
| North Dakota | America/Chicago              | America/Denver            | Central and southwestern Mountain areas                  |
| Oregon       | America/Boise                | America/Los_Angeles       | Mountain portion of Malheur County and Pacific remainder |
| South Dakota | America/Chicago              | America/Denver            | Central and western Mountain areas                       |
| Tennessee    | America/New_York             | America/Chicago           | Eastern and Central areas                                |
| Texas        | America/Chicago              | America/Denver            | Central and far-west Mountain areas                      |

All eight non-state entries in the existing list are included. Micronesia uses
`["Pacific/Pohnpei", "Pacific/Chuuk"]`: Pohnpei represents the earlier UTC+11 group (including
Kosrae under current rules), while Chuuk represents the UTC+10 group (including Yap). The Marshall
Islands use `Pacific/Majuro` for their current UTC+12 regime, including Kwajalein. These representative
choices do not reconstruct the islands' differing historical rules. The existing supported list
also includes the freely associated states; this metadata does not redefine their political status.

Geography and timezone identifiers reviewed September 24, 2026:

- [Federal standard-time boundaries, 49 CFR Part 71](https://www.ecfr.gov/current/title-49/subtitle-A/part-71),
  particularly §§ 71.5, 71.7, 71.9, and 71.11–14.
- [NIST local-time and DST guidance](https://www.nist.gov/pml/time-and-frequency-division/local-time-faqs)
  for Arizona/Navajo and territory DST exceptions.
- [IANA timezone descriptions](https://data.iana.org/time-zones/tzdb/zone1970.tab) and
  [location names and aliases](https://data.iana.org/time-zones/tzdb/zone.tab).

### Existing license processor conventions

The document-verification-service inventory includes its Washington Pacific-date work and the
state-specific processors/configurations reviewed September 24, 2026. Shared-policy adoption must
preserve each processor's existing instant; a policy mismatch requires separate review.

| Existing processor/configuration                    | Existing convention                                                                                    | Adoption guidance                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Washington; Hawaii; Idaho; Michigan                 | Los Angeles; Honolulu; Boise; Detroit respectively                                                     | Shared first entries match                                                       |
| Kentucky; Kansas; North Dakota; South Dakota; Texas | New York for Kentucky; Chicago for the other four                                                      | Shared first entries match                                                       |
| Oregon BON                                          | America/Los_Angeles                                                                                    | Preserve explicit exception; shared policy prefers Boise                         |
| Nevada BON                                          | America/Los_Angeles                                                                                    | Preserve explicit exception; shared policy prefers Denver                        |
| Arizona BON                                         | America/Phoenix                                                                                        | Preserve explicit exception; shared policy prefers Denver and differs during DST |
| Remaining explicit-zone CNA processors/configs      | New York, Chicago, or Denver for their issuing state                                                   | Shared first entries match; validate each migration with existing fixtures       |
| Legacy California, Florida, Ohio, RN, and LVN       | Shared UTC end-of-day suffix                                                                           | Preserve legacy convention; do not substitute state end-of-day                   |
| Nebraska presence-based verification                | Verification instant plus two UTC calendar years; inactive observation can use its observation instant | Preserve synthetic/observation timestamp semantics                               |

Changing only the timezone annotation cannot reconstruct an original registry calendar date for
legacy or synthetic expirations. Do not rewrite those instants while adopting this package.

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
