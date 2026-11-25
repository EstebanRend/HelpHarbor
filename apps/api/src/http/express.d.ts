import type { AuthContext } from "../auth/auth-context";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      /** Set by `SessionGuard` on authenticated routes. */
      auth?: AuthContext;
    }
  }
}

export {};
