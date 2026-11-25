import { HttpStatus } from "@nestjs/common";
import { ObjectIdSchema } from "@helpharbor/contracts";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { ApiError } from "../http/api-error";

/**
 * Keyset cursors: the sort key of the last item on a page plus its `_id` as a
 * tie-breaker, so pages stay stable however many tickets share a timestamp.
 * A cursor is bound to what it pages (`scope`, e.g. a queue view or one
 * ticket's conversation) and is refused anywhere else.
 */
const CursorPayloadSchema = z.strictObject({
  s: z.string().min(1).max(64),
  at: z.number().int().nonnegative(),
  id: ObjectIdSchema,
});

export interface CursorPosition {
  at: Date;
  id: ObjectId;
}

export function encodeCursor(scope: string, position: CursorPosition): string {
  return Buffer.from(
    JSON.stringify({ s: scope, at: position.at.getTime(), id: position.id.toHexString() }),
  ).toString("base64url");
}

const invalidCursor = () =>
  new ApiError(HttpStatus.BAD_REQUEST, "invalid_cursor", "The cursor is not valid for this list; start from the first page");

export function decodeCursor(scope: string, cursor: string): CursorPosition {
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw invalidCursor();
  }
  const parsed = CursorPayloadSchema.safeParse(payload);
  if (!parsed.success || parsed.data.s !== scope) throw invalidCursor();
  return { at: new Date(parsed.data.at), id: new ObjectId(parsed.data.id) };
}

/** Filter for "after this position" in a `{ <field>: dir, _id: dir }` sort. */
export function afterPosition(field: string, position: CursorPosition, direction: 1 | -1) {
  const op = direction === 1 ? "$gt" : "$lt";
  return {
    $or: [{ [field]: { [op]: position.at } }, { [field]: position.at, _id: { [op]: position.id } }],
  };
}
