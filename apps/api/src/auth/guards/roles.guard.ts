import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { hasPermission, type Permission } from "@helpharbor/contracts";
import type { Request } from "express";
import { ApiError } from "../../http/api-error";
import { REQUIRED_PERMISSION } from "../decorators";

/** Last global guard: checks `@RequirePermission()` against the role in the active workspace. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permission = this.reflector.getAllAndOverride<Permission | undefined>(REQUIRED_PERMISSION, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!permission) return true;

    const role = context.switchToHttp().getRequest<Request>().auth?.tenant?.role;
    if (!role) {
      throw new Error("RequirePermission needs TenantGuard; do not combine it with SkipTenant or Public");
    }
    if (!hasPermission(role, permission)) throw ApiError.forbidden();
    return true;
  }
}
