import { VersioningType, type INestApplication } from "@nestjs/common";
import type { AppConfig } from "./config/env";

/** Shared by `main.ts` and the e2e tests so both serve identical routes. */
export function configureApp(app: INestApplication, config: AppConfig): INestApplication {
  app.setGlobalPrefix("api");
  app.enableVersioning({ type: VersioningType.URI });
  app.enableCors({ origin: config.WEB_ORIGIN, credentials: true });
  app.enableShutdownHooks();
  return app;
}
