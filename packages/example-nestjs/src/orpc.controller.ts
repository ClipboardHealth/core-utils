import { Controller } from "@nestjs/common";
import { Implement, implement } from "@orpc/nest";

import { orpcContract } from "./orpcContract";

@Controller()
export class OrpcController {
  @Implement(orpcContract.list)
  public list() {
    // Return the query object to easily test query parsing.
    return implement(orpcContract.list).handler(({ input }) => input.query);
  }
}
