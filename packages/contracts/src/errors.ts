import { z } from "zod";

/** Every non-2xx API response uses this envelope. */
export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string().regex(/^[a-z][a-z0-9_]*$/, "snake_case error code"),
    message: z.string().min(1),
    requestId: z.string().min(1).optional(),
    details: z
      .array(
        z.object({
          path: z.string(),
          message: z.string(),
        }),
      )
      .optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
