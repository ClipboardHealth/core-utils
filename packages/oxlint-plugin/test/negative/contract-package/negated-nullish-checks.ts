// This import is lint input, not a plugin build dependency.
// nx-ignore-next-line
import { isDefined, isNil } from "@clipboard-health/util-ts";

export function checkPresence(value: unknown) {
  return {
    missing: !isDefined(value),
    present: !isNil(value),
  };
}
