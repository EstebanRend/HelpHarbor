import { ConfigValidationError, loadConfig } from "./env";

const valid = {
  MONGODB_URI: "mongodb://localhost:27017/helpharbor?directConnection=true",
  REDIS_URL: "redis://localhost:6379",
};

describe("loadConfig", () => {
  it("applies defaults for optional settings", () => {
    const config = loadConfig(valid);
    expect(config).toMatchObject({
      NODE_ENV: "development",
      API_PORT: 4000,
      WEB_ORIGIN: "http://localhost:3000",
      APP_VERSION: "0.0.0",
      SESSION_IDLE_MINUTES: 480,
      SESSION_ABSOLUTE_HOURS: 168,
      COOKIE_SECURE: false,
    });
  });

  it("coerces the port from a string", () => {
    expect(loadConfig({ ...valid, API_PORT: "4100" }).API_PORT).toBe(4100);
  });

  it("returns a frozen object", () => {
    expect(Object.isFrozen(loadConfig(valid))).toBe(true);
  });

  it("lists every invalid or missing variable", () => {
    try {
      loadConfig({ API_PORT: "99999", REDIS_URL: "localhost:6379" });
      throw new Error("expected loadConfig to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      const issues = (error as ConfigValidationError).issues.join("\n");
      expect(issues).toContain("API_PORT");
      expect(issues).toContain("MONGODB_URI");
      expect(issues).toContain("REDIS_URL");
    }
  });

  it("accepts a mongodb+srv URI for managed clusters", () => {
    const uri = "mongodb+srv://cluster0.example.net/helpharbor";
    expect(loadConfig({ ...valid, MONGODB_URI: uri }).MONGODB_URI).toBe(uri);
  });

  it("marks the session cookie Secure in production unless overridden", () => {
    expect(loadConfig({ ...valid, NODE_ENV: "production" }).COOKIE_SECURE).toBe(true);
    expect(loadConfig({ ...valid, NODE_ENV: "production", COOKIE_SECURE: "false" }).COOKIE_SECURE).toBe(false);
    expect(loadConfig({ ...valid, COOKIE_SECURE: "true" }).COOKIE_SECURE).toBe(true);
  });

  it("rejects ambiguous cookie flags and too-short session lifetimes", () => {
    expect(() => loadConfig({ ...valid, COOKIE_SECURE: "yes" })).toThrow(ConfigValidationError);
    expect(() => loadConfig({ ...valid, SESSION_IDLE_MINUTES: "1" })).toThrow(ConfigValidationError);
  });
});
