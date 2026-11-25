import { Controller, Get, Param, Query, Req, Res } from "@nestjs/common";
import {
  MessageListQuerySchema,
  TicketListQuerySchema,
  type MessageListQuery,
  type MessageListResponse,
  type TicketListQuery,
  type TicketListResponse,
} from "@helpharbor/contracts";
import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import type { TenantAuthContext } from "../auth/auth-context";
import { CurrentTenant, RequirePermission } from "../auth/decorators";
import type { CustomerDoc } from "../database/documents";
import { ApiError } from "../http/api-error";
import { ZodQueryPipe } from "../http/zod-query.pipe";
import { etagMatches, ticketEtag, toTicketDetail, toTicketMessage, toTicketSummary } from "./presenters";
import { TicketsRepository } from "./tickets.repository";

/** A malformed id is answered like an id from another tenant: 404, nothing revealed. */
function parseTicketId(id: string): ObjectId {
  if (!/^[a-f0-9]{24}$/.test(id)) throw ApiError.notFound("Ticket");
  return new ObjectId(id);
}

function requireCustomer(customers: Map<string, CustomerDoc>, id: ObjectId): CustomerDoc {
  const customer = customers.get(id.toHexString());
  if (!customer) throw new Error(`ticket references missing customer ${id.toHexString()}`);
  return customer;
}

@Controller({ path: "tickets", version: "1" })
@RequirePermission("tickets:read")
export class TicketsController {
  constructor(private readonly tickets: TicketsRepository) {}

  @Get()
  async list(
    @CurrentTenant() auth: TenantAuthContext,
    @Query(new ZodQueryPipe(TicketListQuerySchema)) query: TicketListQuery,
  ): Promise<TicketListResponse> {
    const page = await this.tickets.listQueue(auth.tenant.id, auth.user._id, query);
    const customers = await this.tickets.customersById(auth.tenant.id, page.items.map((t) => t.customerId));
    return {
      view: query.view,
      tickets: page.items.map((ticket) => toTicketSummary(ticket, requireCustomer(customers, ticket.customerId))),
      nextCursor: page.nextCursor,
    };
  }

  /** Served with a strong `ETag`; `If-None-Match` with the current one answers 304. */
  @Get(":id")
  async detail(
    @CurrentTenant() auth: TenantAuthContext,
    @Param("id") id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const ticket = await this.tickets.findTicket(auth.tenant.id, parseTicketId(id));
    if (!ticket) throw ApiError.notFound("Ticket");

    const etag = ticketEtag(ticket);
    res.setHeader("ETag", etag);
    // Revalidate every time: a ticket changes while an agent looks at it.
    res.setHeader("Cache-Control", "private, no-cache");
    if (etagMatches(req.header("if-none-match"), etag)) {
      res.status(304).end();
      return;
    }
    const customers = await this.tickets.customersById(auth.tenant.id, [ticket.customerId]);
    res.status(200).json(toTicketDetail(ticket, requireCustomer(customers, ticket.customerId)));
  }

  @Get(":id/messages")
  async messages(
    @CurrentTenant() auth: TenantAuthContext,
    @Param("id") id: string,
    @Query(new ZodQueryPipe(MessageListQuerySchema)) query: MessageListQuery,
  ): Promise<MessageListResponse> {
    const ticketId = parseTicketId(id);
    const ticket = await this.tickets.findTicket(auth.tenant.id, ticketId);
    if (!ticket) throw ApiError.notFound("Ticket");
    const page = await this.tickets.listMessages(auth.tenant.id, ticketId, query);
    return { messages: page.items.map(toTicketMessage), nextCursor: page.nextCursor };
  }
}
