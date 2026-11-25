import { Module } from "@nestjs/common";
import { TicketStore } from "./ticket-store";
import { TicketsController } from "./tickets.controller";
import { TicketsRepository } from "./tickets.repository";

@Module({
  controllers: [TicketsController],
  providers: [TicketStore, TicketsRepository],
  exports: [TicketStore],
})
export class TicketsModule {}
