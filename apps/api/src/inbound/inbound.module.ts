import { Module } from "@nestjs/common";
import { TenantsModule } from "../tenants/tenants.module";
import { TicketsModule } from "../tickets/tickets.module";
import { InboundController } from "./inbound.controller";
import { InboundSignatureGuard } from "./inbound-signature.guard";
import { InboundService } from "./inbound.service";

@Module({
  imports: [TenantsModule, TicketsModule],
  controllers: [InboundController],
  providers: [InboundService, InboundSignatureGuard],
})
export class InboundModule {}
