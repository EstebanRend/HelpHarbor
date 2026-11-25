import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const SAFE_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** Accepts a well-formed `x-request-id` from a proxy, otherwise generates one, and echoes it back. */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header("x-request-id");
  req.requestId = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader("x-request-id", req.requestId);
  next();
}
