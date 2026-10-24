import { defineRule } from "@oxlint/plugins";

import enforceContractInControllers from "../enforce-contract-in-controllers";

const REPLACEMENT = "enforce-contract-in-controllers";

/** Deprecated alias of `enforce-contract-in-controllers`, kept until the plugins' next major. */
const rule = defineRule({
  ...enforceContractInControllers,
  meta: {
    ...enforceContractInControllers.meta,
    deprecated: {
      message: `Renamed to \`${REPLACEMENT}\`, which accepts the same options.`,
      replacedBy: [{ rule: { name: REPLACEMENT } }],
    },
    // ESLint 8 reports replacements from this field, not from `deprecated.replacedBy`.
    replacedBy: [REPLACEMENT],
  },
});

export default rule;
