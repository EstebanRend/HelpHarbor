import { z } from "zod";

/**
 * Ticket lifecycle: new → open → pending_customer → open → solved → closed,
 * with on_hold as a side state. The SLA clock pauses in pending_customer and on_hold.
 */
export const TicketStatusSchema = z.enum([
  "new",
  "open",
  "pending_customer",
  "on_hold",
  "solved",
  "closed",
]);
export type TicketStatus = z.infer<typeof TicketStatusSchema>;

export const TicketPrioritySchema = z.enum(["low", "normal", "high", "urgent"]);
export type TicketPriority = z.infer<typeof TicketPrioritySchema>;

/** Statuses in which business minutes do not count towards the SLA. */
export const SLA_PAUSED_STATUSES: readonly TicketStatus[] = ["pending_customer", "on_hold"];

export function isSlaPaused(status: TicketStatus): boolean {
  return SLA_PAUSED_STATUSES.includes(status);
}
