import { Controller, Get, Inject } from "@nestjs/common";
import { HealthResponseSchema, type HealthResponse } from "@helpharbor/contracts";
import { Public } from "../auth/decorators";
import { APP_CONFIG, type AppConfig } from "../config/env";

@Public()
@Controller({ path: "health", version: "1" })
export class HealthController {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  @Get()
  check(): HealthResponse {
    // Parse our own output so a drift from the shared contract fails loudly in tests.
    return HealthResponseSchema.parse({
      status: "ok",
      service: "helpharbor-api",
      version: this.config.APP_VERSION,
      environment: this.config.NODE_ENV,
      uptimeSeconds: Math.floor(process.uptime()),
      time: new Date().toISOString(),
    });
  }
}
