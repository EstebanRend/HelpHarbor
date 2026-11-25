import { TenantMembersResponseSchema, hasPermission } from "@helpharbor/contracts";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppHeader } from "@/components/app-header";
import { loginUrl } from "@/lib/return-to";
import { apiGet, requireSession } from "@/lib/server-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Members",
};

const PATH = "/settings/members";

export default async function MembersPage() {
  const session = await requireSession(PATH);
  const role = session.activeTenant?.role;
  const allowed = role !== undefined && hasPermission(role, "members:manage");

  let content: ReactNode;
  if (!allowed) {
    content = <p className="empty">Only workspace admins can manage members.</p>;
  } else {
    const response = await apiGet("/api/v1/tenant/members");
    if (response.status === 401) redirect(loginUrl(PATH, true));
    const parsed = TenantMembersResponseSchema.safeParse(await response.json().catch(() => null));
    content = parsed.success ? (
      <table className="table">
        <caption>{parsed.data.members.length} members of {parsed.data.tenant.name}</caption>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Email</th>
            <th scope="col">Role</th>
            <th scope="col">Member since</th>
          </tr>
        </thead>
        <tbody>
          {parsed.data.members.map((m) => (
            <tr key={m.userId}>
              <td>{m.displayName}</td>
              <td>{m.email}</td>
              <td>{m.role}</td>
              <td>{m.joinedAt.slice(0, 10)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ) : (
      <p className="form-error" role="alert">
        Members could not be loaded (HTTP {response.status}).
      </p>
    );
  }

  return (
    <div className="console">
      <AppHeader session={session} currentPath={PATH} />
      <main id="main" className="page">
        <h1>Members</h1>
        {content}
      </main>
    </div>
  );
}
