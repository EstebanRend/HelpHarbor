import { Module } from "@nestjs/common";
import { TenantController } from "./tenant.controller";
import { TenancyRepository } from "./tenancy.repository";

@Module({
  controllers: [TenantController],
  providers: [TenancyRepository],
  exports: [TenancyRepository],
})
export class TenantsModule {}
