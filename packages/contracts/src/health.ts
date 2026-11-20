import { z } from "zod";

/** Response of `GET /api/v1/health` (liveness: the process is up and configured). */
export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("helpharbor-api"),
  version: z.string().min(1),
  environment: z.enum(["development", "test", "production"]),
  uptimeSeconds: z.number().int().nonnegative(),
  time: z.iso.datetime(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
