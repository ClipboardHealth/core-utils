import { createPreferPositiveNullishCheckRule } from "../../internal/createPreferPositiveNullishCheckRule";

export default createPreferPositiveNullishCheckRule({
  name: "prefer-is-defined",
  negated: "isNil",
  preferred: "isDefined",
});
