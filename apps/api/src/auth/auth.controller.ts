import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Req, Res } from "@nestjs/common";
import {
  LoginRequestSchema,
  SESSION_COOKIE_NAME,
  SwitchTenantRequestSchema,
  type LoginRequest,
  type SessionResponse,
  type SwitchTenantRequest,
} from "@helpharbor/contracts";
import type { Request, Response } from "express";
import { APP_CONFIG, type AppConfig } from "../config/env";
import { readCookie } from "../http/cookies";
import { ZodBodyPipe } from "../http/zod-body.pipe";
import type { AuthContext } from "./auth-context";
import { AuthService } from "./auth.service";
import { CurrentAuth, Public, SkipTenant } from "./decorators";
import { clearSessionCookie, setSessionCookie } from "./session-cookie";
import { SessionsRepository } from "./sessions.repository";

@Controller({ path: "auth", version: "1" })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsRepository,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodBodyPipe(LoginRequestSchema)) body: LoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    const { token, response } = await this.auth.login(body);
    // Never reuse a session the browser already had (session fixation).
    const previous = readCookie(req.headers.cookie, SESSION_COOKIE_NAME);
    if (previous) await this.sessions.deleteByToken(previous);
    setSessionCookie(res, this.config, token);
    res.setHeader("Cache-Control", "no-store");
    return response;
  }

  @SkipTenant()
  @Get("session")
  session(@CurrentAuth() auth: AuthContext, @Res({ passthrough: true }) res: Response): Promise<SessionResponse> {
    res.setHeader("Cache-Control", "no-store");
    return this.auth.describe(auth);
  }

  @SkipTenant()
  @Post("switch-tenant")
  @HttpCode(HttpStatus.OK)
  switchTenant(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodBodyPipe(SwitchTenantRequestSchema)) body: SwitchTenantRequest,
  ): Promise<SessionResponse> {
    return this.auth.switchTenant(auth, body.tenantSlug);
  }

  @SkipTenant()
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentAuth() auth: AuthContext, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(auth);
    clearSessionCookie(res, this.config);
  }
}
