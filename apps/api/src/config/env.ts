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
});

export type AppConfig = Readonly<z.infer<typeof EnvSchema>>;

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
  return Object.freeze(result.data);
}
