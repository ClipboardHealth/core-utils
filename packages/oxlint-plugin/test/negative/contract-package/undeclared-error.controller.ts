import { implement } from "@orpc/nest";

implement(contract).handler(async () => {
  if (!result.isSuccess) {
    throw result.error;
  }
});
