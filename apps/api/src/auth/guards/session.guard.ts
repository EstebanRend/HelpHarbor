import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { SESSION_COOKIE_NAME } from "@helpharbor/contracts";
import type { Request, Response } from "express";
import { APP_CONFIG, type AppConfig } from "../../config/env";
import { ApiError } from "../../http/api-error";
import { readCookie } from "../../http/cookies";
import { TenancyRepository } from "../../tenants/tenancy.repository";
import { IS_PUBLIC } from "../decorators";
import { clearSessionCookie } from "../session-cookie";
import { SessionsRepository } from "../sessions.repository";

/**
 * First global guard: every route needs a live session unless marked `@Public()`.
 * No cookie → 401 `unauthenticated`; a cookie whose session timed out, was
 * revoked or belongs to a disabled user → 401 `session_expired`, and the cookie is cleared.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionsRepository,
    private readonly tenancy: TenancyRepository,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const token = readCookie(request.headers.cookie, SESSION_COOKIE_NAME);
    if (!token) throw ApiError.unauthenticated();

    const lookup = await this.sessions.lookup(token);
    if (lookup.state !== "active") {
      clearSessionCookie(response, this.config);
      throw ApiError.sessionExpired();
    }

    const user = await this.tenancy.findUserById(lookup.session.userId);
    if (!user || user.disabledAt) {
      await this.sessions.delete(lookup.session._id);
      clearSessionCookie(response, this.config);
      throw ApiError.sessionExpired();
    }

    request.auth = { session: lookup.session, user };
    return true;
  }
}
