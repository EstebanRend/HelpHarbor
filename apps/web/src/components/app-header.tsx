import type { SessionResponse } from "@helpharbor/contracts";
import Link from "next/link";
import type { ReactNode } from "react";
import { navigationFor } from "@/lib/navigation";
import { SignOutButton } from "./sign-out-button";
import { WorkspaceSwitcher } from "./workspace-switcher";

interface Props {
  session: SessionResponse;
  currentPath: string;
  children?: ReactNode;
}

export function AppHeader({ session, currentPath, children }: Props) {
  const role = session.activeTenant?.role;
  const items = role ? navigationFor(role) : [];

  return (
    <header className="console__header">
      <span className="brand">HelpHarbor</span>
      <WorkspaceSwitcher
        memberships={session.memberships}
        activeSlug={session.activeTenant?.tenant.slug ?? null}
        csrfToken={session.csrfToken}
      />
      <nav aria-label="Main" className="main-nav">
        <ul>
          {items.map((item) => (
            <li key={item.href}>
              {item.available ? (
                <Link href={item.href} aria-current={item.href === currentPath ? "page" : undefined}>
                  {item.label}
                </Link>
              ) : (
                <span aria-disabled="true" title="Planned">
                  {item.label}
                </span>
              )}
            </li>
          ))}
        </ul>
      </nav>
      {children}
      <span className="user">
        {session.user.displayName}
        {role ? <span className="role-badge">{role}</span> : null}
        <SignOutButton csrfToken={session.csrfToken} />
      </span>
    </header>
  );
}
