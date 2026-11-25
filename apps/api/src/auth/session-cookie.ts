import { SESSION_COOKIE_NAME } from "@helpharbor/contracts";
import type { CookieOptions, Response } from "express";
import type { AppConfig } from "../config/env";

function baseOptions(config: AppConfig): CookieOptions {
  // Lax keeps the cookie off cross-site POSTs; the CSRF token covers same-site ones.
  return { httpOnly: true, sameSite: "lax", secure: config.COOKIE_SECURE, path: "/" };
}

export function setSessionCookie(res: Response, config: AppConfig, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    ...baseOptions(config),
    maxAge: config.SESSION_ABSOLUTE_HOURS * 3_600_000,
  });
}

export function clearSessionCookie(res: Response, config: AppConfig): void {
  res.clearCookie(SESSION_COOKIE_NAME, baseOptions(config));
}
