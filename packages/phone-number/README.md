# @clipboard-health/phone-number <!-- omit from toc -->

Phone number utility functions.

## Table of contents <!-- omit from toc -->

- [Install](#install)
- [Usage](#usage)
- [Local development commands](#local-development-commands)

## Install

```bash
npm install @clipboard-health/phone-number
```

## Usage

```typescript
import { randomPhoneNumber } from "@clipboard-health/phone-number";

const nationalPhoneNumber = randomPhoneNumber();
const internationalPhoneNumber = randomPhoneNumber({ international: true });
```

`randomPhoneNumber` produces valid-looking NANP numbers for synthetic identities. The numbers are
not reserved, so callers must suppress outbound routing.

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
