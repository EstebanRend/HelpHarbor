import { ObjectId } from "mongodb";
import { decodeCursor, encodeCursor } from "./cursor";
import { etagMatches } from "./presenters";
import { newReplyToken } from "./reply-token";

describe("keyset cursors", () => {
  const position = { at: new Date("2026-11-20T10:00:00.123Z"), id: new ObjectId() };

  it("round-trips a position within its scope", () => {
    const cursor = encodeCursor("queue:active", position);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor("queue:active", cursor)).toEqual(position);
  });

  it("refuses a cursor from another list or a tampered one", () => {
    const cursor = encodeCursor("queue:active", position);
    expect(() => decodeCursor("queue:done", cursor)).toThrow(/cursor is not valid/);
    expect(() => decodeCursor("queue:active", "not-json")).toThrow(/cursor is not valid/);
    const tampered = Buffer.from(JSON.stringify({ s: "queue:active", at: 1, id: { $ne: null } })).toString("base64url");
    expect(() => decodeCursor("queue:active", tampered)).toThrow(/cursor is not valid/);
  });
});

describe("etagMatches", () => {
  const etag = '"abc.3"';
  it("matches exact, weak and wildcard validators", () => {
    expect(etagMatches('"abc.3"', etag)).toBe(true);
    expect(etagMatches('W/"abc.3"', etag)).toBe(true);
    expect(etagMatches('"abc.2", "abc.3"', etag)).toBe(true);
    expect(etagMatches("*", etag)).toBe(true);
  });
  it("does not match other versions or a missing header", () => {
    expect(etagMatches('"abc.2"', etag)).toBe(false);
    expect(etagMatches(undefined, etag)).toBe(false);
  });
});

describe("newReplyToken", () => {
  it("is 26 lowercase base32 characters and unique", () => {
    const tokens = new Set(Array.from({ length: 500 }, newReplyToken));
    expect(tokens.size).toBe(500);
    for (const token of tokens) expect(token).toMatch(/^[a-z2-7]{26}$/);
  });
});
