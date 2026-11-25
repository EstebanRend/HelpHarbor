import { Controller, Get } from "@nestjs/common";
import {
  ROLE_PERMISSIONS,
  type Permission,
  type Role,
  type TenantMembersResponse,
  type TenantSummary,
} from "@helpharbor/contracts";
import type { TenantAuthContext } from "../auth/auth-context";
import { toTenantSummary } from "../auth/auth.service";
import { CurrentTenant, RequirePermission } from "../auth/decorators";
import { TenancyRepository } from "./tenancy.repository";

/** The active workspace. There is no tenant id in the path: it always comes from the session. */
@Controller({ path: "tenant", version: "1" })
export class TenantController {
  constructor(private readonly tenancy: TenancyRepository) {}

  @Get()
  current(@CurrentTenant() auth: TenantAuthContext): {
    tenant: TenantSummary;
    role: Role;
    permissions: readonly Permission[];
  } {
    return {
      tenant: toTenantSummary(auth.tenant.doc),
      role: auth.tenant.role,
      permissions: ROLE_PERMISSIONS[auth.tenant.role],
    };
  }

  @RequirePermission("members:manage")
  @Get("members")
  async members(@CurrentTenant() auth: TenantAuthContext): Promise<TenantMembersResponse> {
    const members = await this.tenancy.listMembers(auth.tenant.id);
    return {
      tenant: toTenantSummary(auth.tenant.doc),
      members: members.map((m) => ({
        userId: m.user._id.toHexString(),
        email: m.user.emailNormalized,
        displayName: m.user.displayName,
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
      })),
    };
  }
}
