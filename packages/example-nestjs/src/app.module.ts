import { Module } from "@nestjs/common";
import { ORPCModule } from "@orpc/nest";

import { AppController } from "./app.controller";
import { OrpcController } from "./orpc.controller";

@Module({
  controllers: [AppController, OrpcController],
  imports: [ORPCModule.forRoot({})],
})
export class AppModule {}
