# @clipboard-health/usa-states <!-- omit from toc -->

Canonical US state and territory list and `StateCode` type.

## Table of contents <!-- omit from toc -->

- [Install](#install)
- [Usage](#usage)
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

function formatState(name: StateName): string {
  return `The great state of ${name}`;
}
```

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
