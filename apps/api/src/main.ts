import "reflect-metadata";
import { resolve } from "node:path";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { APP_CONFIG, type AppConfig } from "./config/env";
import { configureApp } from "./configure-app";
import { MONGO_DB } from "./database/database.module";
import { ensureCollections } from "./database/schema";

function loadLocalEnvFile(): void {
  try {
    process.loadEnvFile(resolve(__dirname, "../../../.env"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function bootstrap(): Promise<void> {
  loadLocalEnvFile();
  // rawBody: the inbound webhook verifies its HMAC over the exact bytes received.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get<AppConfig>(APP_CONFIG);
  configureApp(app, config);
  // Idempotent: creates collections, validators and indexes before serving traffic.
  await ensureCollections(app.get(MONGO_DB));
  await app.listen(config.API_PORT);
  new Logger("Bootstrap").log(`API listening on http://localhost:${config.API_PORT}/api/v1/health`);
}

void bootstrap();
