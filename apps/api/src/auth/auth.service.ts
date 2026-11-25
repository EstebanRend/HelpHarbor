import { HttpStatus, Injectable } from "@nestjs/common";
import type { LoginRequest, MembershipSummary, SessionResponse, TenantSummary } from "@helpharbor/contracts";
import type { ObjectId } from "mongodb";
import type { SessionDoc, TenantDoc, UserDoc } from "../database/documents";
import { ApiError } from "../http/api-error";
import { type MembershipWithTenant, TenancyRepository } from "../tenants/tenancy.repository";
import type { AuthContext } from "./auth-context";
import { PasswordService } from "./password.service";
import { SessionsRepository } from "./sessions.repository";

export function toTenantSummary(tenant: TenantDoc): TenantSummary {
  return { id: tenant._id.toHexString(), slug: tenant.slug, name: tenant.name, timezone: tenant.timezone };
}

function toMembershipSummary(membership: MembershipWithTenant): MembershipSummary {
  return { tenant: toTenantSummary(membership.tenant), role: membership.role };
}

const invalidCredentials = () =>
  new ApiError(HttpStatus.UNAUTHORIZED, "invalid_credentials", "Email or password is incorrect");

const workspaceNotFound = () => ApiError.notFound("Workspace");

@Injectable()
export class AuthService {
  constructor(
    private readonly tenancy: TenancyRepository,
    private readonly sessions: SessionsRepository,
    private readonly passwords: PasswordService,
  ) {}

  /**
   * Checks the password and starts a new session. Unknown email, wrong
   * password and disabled account all return the same error after the same
   * amount of hashing work.
   */
  async login(body: LoginRequest): Promise<{ token: string; response: SessionResponse }> {
    const user = await this.tenancy.findUserByEmail(body.email);
    const passwordOk = await this.passwords.verify(user?.passwordHash, body.password);
    if (!user || !passwordOk || user.disabledAt) throw invalidCredentials();

    const memberships = await this.tenancy.listMembershipsForUser(user._id);
    let active = memberships[0] ?? null;
    if (body.tenantSlug) {
      active = memberships.find((m) => m.tenant.slug === body.tenantSlug) ?? null;
      if (!active) throw workspaceNotFound();
    }

    const { token, session } = await this.sessions.create(user._id, active?.tenant._id ?? null);
    return { token, response: this.toResponse(user, session, memberships, active) };
  }

  /** Current session, re-reading memberships so role changes show up immediately. */
  async describe(auth: AuthContext): Promise<SessionResponse> {
    const memberships = await this.tenancy.listMembershipsForUser(auth.user._id);
    let active = this.findActive(memberships, auth.session.activeTenantId);
    if (!active && auth.session.activeTenantId) {
      // Membership was removed since the last request: fall back to another workspace.
      active = memberships[0] ?? null;
      await this.sessions.setActiveTenant(auth.session._id, active?.tenant._id ?? null);
    }
    return this.toResponse(auth.user, auth.session, memberships, active);
  }

  /** Switching to a workspace the user does not belong to answers 404, as if it did not exist. */
  async switchTenant(auth: AuthContext, tenantSlug: string): Promise<SessionResponse> {
    const memberships = await this.tenancy.listMembershipsForUser(auth.user._id);
    const target = memberships.find((m) => m.tenant.slug === tenantSlug);
    if (!target) throw workspaceNotFound();
    await this.sessions.setActiveTenant(auth.session._id, target.tenant._id);
    return this.toResponse(auth.user, { ...auth.session, activeTenantId: target.tenant._id }, memberships, target);
  }

  async logout(auth: AuthContext): Promise<void> {
    await this.sessions.delete(auth.session._id);
  }

  private findActive(memberships: MembershipWithTenant[], tenantId: ObjectId | null): MembershipWithTenant | null {
    if (!tenantId) return null;
    return memberships.find((m) => m.tenant._id.equals(tenantId)) ?? null;
  }

  private toResponse(
    user: UserDoc,
    session: SessionDoc,
    memberships: MembershipWithTenant[],
    active: MembershipWithTenant | null,
  ): SessionResponse {
    return {
      user: { id: user._id.toHexString(), email: user.emailNormalized, displayName: user.displayName },
      memberships: memberships.map(toMembershipSummary),
      activeTenant: active ? toMembershipSummary(active) : null,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt.toISOString(),
    };
  }
}
