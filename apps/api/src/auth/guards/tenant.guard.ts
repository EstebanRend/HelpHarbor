import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { ApiError } from "../../http/api-error";
import { TenancyRepository } from "../../tenants/tenancy.repository";
import { IS_PUBLIC, SKIP_TENANT } from "../decorators";

/**
 * Third global guard. The tenant always comes from the session's active
 * workspace — never from the URL or body — and the membership is read again
 * on every request, so a removed member or changed role takes effect at once.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenancy: TenancyRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(SKIP_TENANT, targets)) return true;

    const auth = context.switchToHttp().getRequest<Request>().auth;
    if (!auth) throw ApiError.unauthenticated();

    const tenantId = auth.session.activeTenantId;
    const role = tenantId ? await this.tenancy.findRole(tenantId, auth.user._id) : null;
    const tenant = tenantId && role ? await this.tenancy.findTenantById(tenantId) : null;
    if (!tenantId || !role || !tenant) {
      throw new ApiError(HttpStatus.FORBIDDEN, "no_workspace", "Choose a workspace you belong to");
    }

    auth.tenant = { id: tenantId, doc: tenant, role };
    return true;
  }
}
