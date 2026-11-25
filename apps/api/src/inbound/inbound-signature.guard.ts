import { type CanActivate, type ExecutionContext, HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import { INBOUND_SIGNATURE_HEADER } from "@helpharbor/contracts";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { APP_CONFIG, type AppConfig } from "../config/env";
import { ApiError } from "../http/api-error";
import { verifyInboundSignature } from "./signature";

/**
 * Route guard for the inbound webhook. It runs before the body is validated,
 * so unsigned requests learn nothing about the payload format. Every failure
 * answers the same 401; the reason is only logged.
 */
@Injectable()
export class InboundSignatureGuard implements CanActivate {
  private readonly logger = new Logger("Inbound");

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RawBodyRequest<Request>>();
    const secret = this.config.INBOUND_WEBHOOK_SECRET;
    if (!secret) {
      throw new ApiError(HttpStatus.SERVICE_UNAVAILABLE, "inbound_disabled", "Inbound email is not configured");
    }
    if (!request.is("application/json") || !request.rawBody) {
      throw new ApiError(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "unsupported_media_type", "Send the email as application/json");
    }
    const check = verifyInboundSignature(
      secret,
      request.header(INBOUND_SIGNATURE_HEADER),
      request.rawBody,
      this.config.INBOUND_SIGNATURE_TOLERANCE_SECONDS,
    );
    if (!check.ok) {
      this.logger.warn(`rejected inbound request: signature ${check.reason} [${request.requestId}]`);
      throw new ApiError(HttpStatus.UNAUTHORIZED, "invalid_signature", "Missing, expired or invalid signature");
    }
    return true;
  }
}
