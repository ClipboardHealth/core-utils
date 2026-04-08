import { Controller, Logger } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";

import { contract, type UserDto } from "./contract";

@Controller()
export class AppController {
  private readonly items = new Map<string, UserDto["data"]>();
  private readonly logger = new Logger(AppController.name);
  private nextId = 0;

  @TsRestHandler(contract)
  async handler() {
    return tsRestHandler(contract, {
      create: async ({ body }) => {
        this.nextId += 1;
        const item = { id: String(this.nextId), ...body.data };
        this.items.set(item.id, item);

        return {
          body: { data: item },
          status: 201,
        };
      },
      list: async ({ query }) => {
        this.logger.log({ query });
        return { body: query, status: 200 };
      },
    });
  }
}
