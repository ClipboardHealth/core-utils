import { NestFactory } from "@nestjs/core";
import { type NestExpressApplication } from "@nestjs/platform-express";
import qs from "qs";

import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set("query parser", (queryString: string) =>
    qs.parse(queryString, {
      allowPrototypes: true,
      arrayLimit: 100,
    }),
  );
  const port = process.env["PORT"] ?? 3000;
  await app.listen(port);
}

void bootstrap();
