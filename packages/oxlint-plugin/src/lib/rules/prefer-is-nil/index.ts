import { createPreferPositiveNullishCheckRule } from "../../internal/createPreferPositiveNullishCheckRule";

export default createPreferPositiveNullishCheckRule({
  name: "prefer-is-nil",
  negated: "isDefined",
  preferred: "isNil",
});
