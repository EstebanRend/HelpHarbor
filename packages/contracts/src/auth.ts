import { z } from "zod";
import { ObjectIdSchema, RoleSchema, TenantSlugSchema } from "./common";

/** Name of the httpOnly session cookie set by `POST /api/v1/auth/login`. */
export const SESSION_COOKIE_NAME = "hh_session";

/** Header that must echo the session's CSRF token on every state-changing request. */
export const CSRF_HEADER_NAME = "x-csrf-token";

/** Body of `POST /api/v1/auth/login`. */
export const LoginRequestSchema = z.strictObject({
  /** Trimmed and lower-cased before validation, matching how emails are stored. */
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(1).max(256),
  /** Optional workspace to open; defaults to the first membership. */
  tenantSlug: TenantSlugSchema.optional(),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/** Body of `POST /api/v1/auth/switch-tenant`. */
export const SwitchTenantRequestSchema = z.strictObject({
  tenantSlug: TenantSlugSchema,
});
export type SwitchTenantRequest = z.infer<typeof SwitchTenantRequestSchema>;

export const SessionUserSchema = z.object({
  id: ObjectIdSchema,
  email: z.email(),
  displayName: z.string().min(1),
});
export type SessionUser = z.infer<typeof SessionUserSchema>;

export const TenantSummarySchema = z.object({
  id: ObjectIdSchema,
  slug: TenantSlugSchema,
  name: z.string().min(1),
  timezone: z.string().min(1),
});
export type TenantSummary = z.infer<typeof TenantSummarySchema>;

export const MembershipSummarySchema = z.object({
  tenant: TenantSummarySchema,
  role: RoleSchema,
});
export type MembershipSummary = z.infer<typeof MembershipSummarySchema>;

/**
 * Response of login, `GET /api/v1/auth/session` and switch-tenant.
 * `activeTenant` is null only when the user has no memberships at all.
 */
export const SessionResponseSchema = z.object({
  user: SessionUserSchema,
  memberships: z.array(MembershipSummarySchema),
  activeTenant: MembershipSummarySchema.nullable(),
  csrfToken: z.string().min(32),
  expiresAt: z.iso.datetime(),
});
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

export const TenantMemberSchema = z.object({
  userId: ObjectIdSchema,
  email: z.email(),
  displayName: z.string().min(1),
  role: RoleSchema,
  joinedAt: z.iso.datetime(),
});
export type TenantMember = z.infer<typeof TenantMemberSchema>;

/** Response of `GET /api/v1/tenant/members` (admins only). */
export const TenantMembersResponseSchema = z.object({
  tenant: TenantSummarySchema,
  members: z.array(TenantMemberSchema),
});
export type TenantMembersResponse = z.infer<typeof TenantMembersResponseSchema>;
