import { z } from "zod";

/** MongoDB ObjectId rendered as a 24-character lowercase hex string. */
export const ObjectIdSchema = z
  .string()
  .regex(/^[a-f0-9]{24}$/, "must be a 24-character hex ObjectId");
export type ObjectId = z.infer<typeof ObjectIdSchema>;

/** Tenant workspace slug used in URLs, e.g. `northwind`. */
export const TenantSlugSchema = z
  .string()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase letters, digits and single hyphens only");
export type TenantSlug = z.infer<typeof TenantSlugSchema>;

/** Membership roles, checked server-side on every request. */
export const RoleSchema = z.enum(["admin", "lead", "agent"]);
export type Role = z.infer<typeof RoleSchema>;
