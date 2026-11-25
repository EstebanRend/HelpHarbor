import { createParamDecorator, type ExecutionContext, SetMetadata } from "@nestjs/common";
import type { Permission } from "@helpharbor/contracts";
import type { Request } from "express";
import type { AuthContext, TenantAuthContext } from "./auth-context";

export const IS_PUBLIC = "helpharbor:public";
export const SKIP_TENANT = "helpharbor:skip-tenant";
export const REQUIRED_PERMISSION = "helpharbor:permission";

/** No session needed (health, login). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Needs a session but not an active workspace (session info, switching, logout). */
export const SkipTenant = () => SetMetadata(SKIP_TENANT, true);

/** Checked by `RolesGuard` against the role in the active workspace. */
export const RequirePermission = (permission: Permission) => SetMetadata(REQUIRED_PERMISSION, permission);

export const CurrentAuth = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthContext => {
  const auth = ctx.switchToHttp().getRequest<Request>().auth;
  if (!auth) throw new Error("CurrentAuth used on a route without SessionGuard");
  return auth;
});

export const CurrentTenant = createParamDecorator((_data: unknown, ctx: ExecutionContext): TenantAuthContext => {
  const auth = ctx.switchToHttp().getRequest<Request>().auth;
  if (!auth?.tenant) throw new Error("CurrentTenant used on a route without TenantGuard");
  return auth as TenantAuthContext;
});
