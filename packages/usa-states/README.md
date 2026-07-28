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
import { isStateCode, type StateCode, US_STATES } from "@clipboard-health/usa-states";

US_STATES.find((state) => state.code === "CA");
// => { name: "California", code: "CA" }

function parseStateCode(value: string): StateCode | undefined {
  return isStateCode(value) ? value : undefined;
}
```

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
