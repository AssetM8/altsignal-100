import { z } from "zod";

/**
 * Server-side environment. Never import this module from a client component:
 * it reads secrets. Values are parsed lazily so tests can override process.env.
 */
const EnvSchema = z.object({
  ALTSIGNAL_MODE: z.enum(["demo", "live"]).default("demo"),
  DATABASE_URL: z.string().default("file:./data/altsignal.db"),
  ALTSIGNAL_DISABLED_PROVIDERS: z
    .string()
    .default("")
    .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean)),
  ADMIN_TOKEN: z.string().default(""),
  ALTSIGNAL_CONTACT: z.string().default("altsignal-100 research prototype"),
  REDDIT_CLIENT_ID: z.string().default(""),
  REDDIT_CLIENT_SECRET: z.string().default(""),
  GITHUB_TOKEN: z.string().default(""),
  FMP_API_KEY: z.string().default(""),
});

export type ServerEnv = z.infer<typeof EnvSchema>;

export function getEnv(): ServerEnv {
  return EnvSchema.parse({
    ALTSIGNAL_MODE: process.env.ALTSIGNAL_MODE || undefined,
    DATABASE_URL: process.env.DATABASE_URL || undefined,
    ALTSIGNAL_DISABLED_PROVIDERS: process.env.ALTSIGNAL_DISABLED_PROVIDERS || undefined,
    ADMIN_TOKEN: process.env.ADMIN_TOKEN || undefined,
    ALTSIGNAL_CONTACT: process.env.ALTSIGNAL_CONTACT || undefined,
    REDDIT_CLIENT_ID: process.env.REDDIT_CLIENT_ID || undefined,
    REDDIT_CLIENT_SECRET: process.env.REDDIT_CLIENT_SECRET || undefined,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN || undefined,
    FMP_API_KEY: process.env.FMP_API_KEY || undefined,
  });
}
