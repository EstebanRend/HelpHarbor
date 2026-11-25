import type { Role } from "@helpharbor/contracts";
import type { ObjectId } from "mongodb";
import type { SessionDoc, TenantDoc, UserDoc } from "../database/documents";

/** What `SessionGuard` and `TenantGuard` attach to `request.auth`. */
export interface AuthContext {
  session: SessionDoc;
  user: UserDoc;
  /** Set by `TenantGuard` from the session's active tenant and a fresh membership lookup. */
  tenant?: {
    id: ObjectId;
    doc: TenantDoc;
    role: Role;
  };
}

/** `AuthContext` after `TenantGuard` has run. */
export type TenantAuthContext = AuthContext & { tenant: NonNullable<AuthContext["tenant"]> };
