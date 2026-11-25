import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { ConfigModule } from "./config/config.module";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";
import { TenantsModule } from "./tenants/tenants.module";

@Module({
  imports: [ConfigModule, DatabaseModule, HealthModule, TenantsModule, AuthModule],
})
export class AppModule {}
