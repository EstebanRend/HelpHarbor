import type { Role } from "./common";

/**
 * Staff permissions, one per row of the role matrix in
 * `docs/product/personas.md`. The API enforces them in `RolesGuard`;
 * the web app only uses them to decide what to show.
 */
export const PERMISSIONS = [
  "tickets:read",
  "tickets:reply",
  "tickets:assign_others",
  "sla:manage",
  "kb:draft",
  "kb:publish",
  "reports:read",
  "members:manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const LEAD: readonly Permission[] = [
  "tickets:read",
  "tickets:reply",
  "tickets:assign_others",
  "kb:draft",
  "kb:publish",
  "reports:read",
];

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = Object.freeze({
  admin: PERMISSIONS,
  lead: LEAD,
  agent: ["tickets:read", "tickets:reply"],
});

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
