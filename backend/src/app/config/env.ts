import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().url().default("postgres://postgres:341648@localhost:5432/bcis_db"),
  JWT_SECRET: z.string().min(32).default("super-secret-development-jwt-key-replace-in-production-min-32-chars"),
  CORS_ORIGIN: z.string().default("http://localhost:5173,tauri://localhost,http://tauri.localhost"),
  UPLOAD_DIR: z.string().default("./uploads"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment configuration:", result.error.format());
    throw new Error("Invalid environment configuration");
  }
  return result.data;
}

export const env = parseEnv();
