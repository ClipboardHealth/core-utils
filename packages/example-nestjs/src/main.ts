import { NestFactory } from "@nestjs/core";
import { type NestExpressApplication } from "@nestjs/platform-express";

import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set("query parser", "extended");
  const port = process.env["PORT"] ?? 3000;
  await app.listen(port);
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void bootstrap();
