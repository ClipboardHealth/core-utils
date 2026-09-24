# @clipboard-health/usa-states <!-- omit from toc -->

Canonical US state and territory list, `StateCode` and `StateName` types, and name/code normalizers.

## Table of contents <!-- omit from toc -->

- [Install](#install)
- [Usage](#usage)
- [State timezones](#state-timezones)
  - [Ordered choices and geographic exceptions](#ordered-choices-and-geographic-exceptions)
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

  return `State: ${name}`;
}
```

Prefer storing `StateCode` and resolving to `StateName` only for display; codes are the stable
representation to compare across services. Both normalizers return `undefined` for unrecognized
input — treat that as a validation failure rather than falling back to the raw value, otherwise
unnormalized input reaches storage.

## State timezones

`STATE_TIME_ZONES` provides a frozen, nonempty list of representative IANA timezone names for
each supported `StateCode`. `getStateTimeZones` normalizes a state using `toStateCode` and returns
the complete ordered array. Callers decide which entry to use. Existing state names/codes and
`US_STATES` objects are unchanged.

```ts
import { getStateTimeZones, STATE_TIME_ZONES } from "@clipboard-health/usa-states";

STATE_TIME_ZONES.WA;
// => ["America/Los_Angeles"]
STATE_TIME_ZONES.TN;
// => ["America/New_York", "America/Chicago"]

getStateTimeZones({ state: "  tennessee " });
// => ["America/New_York", "America/Chicago"]

getStateTimeZones({ state: "Any" });
// => []
getStateTimeZones({});
// => []
```

The helper accepts `state?: string` and returns a frozen `readonly string[]` directly. An omitted,
blank, `Any`, or unrecognized state returns a frozen empty array. With `exactOptionalPropertyTypes`,
callers should omit `state` when the source value is nullish instead of explicitly passing `null`
or `undefined`. This package supplies timezone metadata; consumers handle selection, formatting,
and conversion with an explicit timezone.

### Ordered choices and geographic exceptions

The first entry prefers the timezone whose local calendar day ends earliest in UTC under current
timezone rules. The ordering is fixed; zones can tie, and historical ordering can differ. Arizona's
entries tie during standard time. The order expresses this preference rather than population or
capital-city coverage. Use the documented order and IANA rules instead of sorting by today's UTC
offset or substituting fixed `PST`/`EST` offsets.

The lists represent current standard-time/DST regimes, rather than every historical IANA location
or alias. Consult date-specific timezone rules when historical ordering matters.

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

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
