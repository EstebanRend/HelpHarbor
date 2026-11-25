import { timingSafeEqual } from "node:crypto";
import { type CanActivate, type ExecutionContext, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { CSRF_HEADER_NAME } from "@helpharbor/contracts";
import type { Request } from "express";
import { APP_CONFIG, type AppConfig } from "../../config/env";
import { ApiError } from "../../http/api-error";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function sameToken(expected: string, actual: string | undefined): boolean {
  if (!actual) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Second global guard, for state-changing methods only:
 * 1. a browser `Origin` header, when present, must be the web origin (also protects login);
 * 2. with a session, `x-csrf-token` must match the session's token (synchronizer token).
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;

    const origin = request.header("origin");
    if (origin !== undefined && origin !== this.config.WEB_ORIGIN) {
      throw new ApiError(HttpStatus.FORBIDDEN, "origin_not_allowed", "Request origin is not allowed");
    }

    if (request.auth && !sameToken(request.auth.session.csrfToken, request.header(CSRF_HEADER_NAME))) {
      throw new ApiError(HttpStatus.FORBIDDEN, "csrf_token_invalid", "Missing or invalid CSRF token");
    }
    return true;
  }
}
