import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_VERSION: z.string().min(1).default("0.0.0"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.url().default("http://localhost:3000"),
  MONGODB_URI: z
    .string()
    .regex(/^mongodb(\+srv)?:\/\//, "must be a mongodb:// or mongodb+srv:// connection string"),
  REDIS_URL: z.string().regex(/^rediss?:\/\//, "must be a redis:// or rediss:// URL"),
  /** A session ends after this many minutes without a request. */
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(1440).default(480),
  /** A session ends this many hours after login, however active it is. */
  SESSION_ABSOLUTE_HOURS: z.coerce.number().int().min(1).max(720).default(168),
  /** Adds the `Secure` flag to the session cookie. Defaults to true in production. */
  COOKIE_SECURE: z.enum(["true", "false"]).optional(),
});

type ParsedEnv = z.infer<typeof EnvSchema>;

export type AppConfig = Readonly<Omit<ParsedEnv, "COOKIE_SECURE"> & { COOKIE_SECURE: boolean }>;

export const APP_CONFIG = Symbol("APP_CONFIG");

export class ConfigValidationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid API configuration:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
    this.name = "ConfigValidationError";
  }
}

/**
 * Validates raw environment variables once at startup so the API fails fast
 * with every problem listed, instead of crashing later on first use.
 */
export function loadConfig(raw: Record<string, string | undefined>): AppConfig {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    throw new ConfigValidationError(
      result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
    );
  }
  const { COOKIE_SECURE, ...rest } = result.data;
  return Object.freeze({
    ...rest,
    COOKIE_SECURE: COOKIE_SECURE === undefined ? rest.NODE_ENV === "production" : COOKIE_SECURE === "true",
  });
}
