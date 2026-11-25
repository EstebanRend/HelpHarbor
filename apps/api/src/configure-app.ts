import { VersioningType, type INestApplication } from "@nestjs/common";
import type { AppConfig } from "./config/env";
import { ApiExceptionFilter } from "./http/api-exception.filter";
import { requestId } from "./http/request-id";

/** Shared by `main.ts` and the e2e tests so both serve identical routes. */
export function configureApp(app: INestApplication, config: AppConfig): INestApplication {
  app.use(requestId);
  app.setGlobalPrefix("api");
  app.enableVersioning({ type: VersioningType.URI });
  app.enableCors({ origin: config.WEB_ORIGIN, credentials: true });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
  return app;
}
