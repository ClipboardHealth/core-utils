import { Controller, Logger } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";

import { contract, UserDto } from "./contract";

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);
  private readonly items = new Map<string, UserDto["data"]>();
  private id = 0;

  @TsRestHandler(contract)
  async handler() {
    return tsRestHandler(contract, {
      create: async ({ body }) => {
        const item = { id: String((this.id += 1)), ...body.data };
        this.items.set(item.id, item);

        return {
          status: 201,
          body: { data: item },
        };
      },
      // @ts-expect-error: boolean type not inferred correctly
      tests: async ({ query }) => {
        this.logger.log({ query });
        return { status: 200, body: query };
      },
    });
  }
}
