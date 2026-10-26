import { oc } from "@orpc/contract";
import { z } from "zod";

import { query } from "./contract";

export const orpcContract = {
  list: oc
    .route({
      description: "List users.",
      inputStructure: "detailed",
      method: "GET",
      path: "/orpc/users",
      successStatus: 200,
    })
    .input(z.object({ query })),
};
