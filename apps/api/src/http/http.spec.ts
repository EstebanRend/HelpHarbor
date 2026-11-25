import { z } from "zod";
import { ApiError } from "./api-error";
import { readCookie } from "./cookies";
import { ZodBodyPipe } from "./zod-body.pipe";

describe("readCookie", () => {
  it("finds a cookie among several", () => {
    expect(readCookie("theme=dark; hh_session=abc123; other=1", "hh_session")).toBe("abc123");
  });

  it("does not match a cookie whose name only ends with the wanted name", () => {
    expect(readCookie("xhh_session=evil", "hh_session")).toBeUndefined();
  });

  it("returns undefined for a missing header or malformed encoding", () => {
    expect(readCookie(undefined, "hh_session")).toBeUndefined();
    expect(readCookie("hh_session=%E0%A4%A", "hh_session")).toBeUndefined();
  });
});

describe("ZodBodyPipe", () => {
  const pipe = new ZodBodyPipe(z.strictObject({ email: z.email(), password: z.string().min(1) }));

  it("returns the parsed body", () => {
    expect(pipe.transform({ email: "a@b.example", password: "x" })).toEqual({ email: "a@b.example", password: "x" });
  });

  it("lists every issue with its path", () => {
    try {
      pipe.transform({ email: { $ne: null }, password: "" });
      throw new Error("expected the pipe to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.getStatus()).toBe(400);
      expect(apiError.code).toBe("validation_failed");
      expect(apiError.details?.map((d) => d.path).sort()).toEqual(["email", "password"]);
    }
  });

  it("names the body when it is not an object", () => {
    try {
      pipe.transform(undefined);
      throw new Error("expected the pipe to throw");
    } catch (error) {
      expect((error as ApiError).details?.[0]?.path).toBe("(body)");
    }
  });
});
