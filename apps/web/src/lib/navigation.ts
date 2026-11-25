import { hasPermission, type Permission, type Role } from "@helpharbor/contracts";

export interface NavItem {
  label: string;
  href: string;
  permission: Permission;
  /** False for areas planned in later weeks; shown but not linked. */
  available: boolean;
}

const NAVIGATION: readonly NavItem[] = [
  { label: "Queue", href: "/console", permission: "tickets:read", available: true },
  { label: "Knowledge base", href: "/kb", permission: "kb:draft", available: false },
  { label: "Reports", href: "/reports", permission: "reports:read", available: false },
  { label: "SLA policies", href: "/settings/sla", permission: "sla:manage", available: false },
  { label: "Members", href: "/settings/members", permission: "members:manage", available: true },
];

/** Navigation for a role. Hiding an entry is cosmetic: the API checks the same permission. */
export function navigationFor(role: Role): NavItem[] {
  return NAVIGATION.filter((item) => hasPermission(role, item.permission));
}
