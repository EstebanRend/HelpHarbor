import { Body, Controller, HttpStatus, Post, Res, UseGuards } from "@nestjs/common";
import { InboundEmailSchema, type InboundEmail, type InboundEmailResult } from "@helpharbor/contracts";
import type { Response } from "express";
import { Public } from "../auth/decorators";
import { ZodBodyPipe } from "../http/zod-body.pipe";
import { InboundSignatureGuard } from "./inbound-signature.guard";
import { InboundService } from "./inbound.service";

/**
 * Webhook of the simulated mail provider. It has no session: the HMAC
 * signature authenticates the sender, and the recipient address picks the
 * workspace. 201 the first time, 200 with `status: "duplicate"` on redelivery.
 */
@Controller({ path: "inbound", version: "1" })
export class InboundController {
  constructor(private readonly inbound: InboundService) {}

  @Public()
  @UseGuards(InboundSignatureGuard)
  @Post("email")
  async email(
    @Body(new ZodBodyPipe(InboundEmailSchema)) email: InboundEmail,
    @Res({ passthrough: true }) res: Response,
  ): Promise<InboundEmailResult> {
    const result = await this.inbound.ingest(email);
    res.status(result.status === "created" ? HttpStatus.CREATED : HttpStatus.OK);
    return result;
  }
}
