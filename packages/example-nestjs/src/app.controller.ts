import { Controller, Logger } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";

import { contract, UserDto } from "./contract";

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);
  private readonly items = new Map<string, UserDto["data"]>();
  private nextId = 0;

  @TsRestHandler(contract)
  async handler() {
    return tsRestHandler(contract, {
      create: async ({ body }) => {
        this.nextId += 1;
        const item = { id: String(this.nextId), ...body.data };
        this.items.set(item.id, item);

        return {
          status: 201,
          body: { data: item },
        };
      },
      list: async ({ query }) => {
        this.logger.log({ query });
        return { status: 200, body: query };
      },
    });
  }
}
