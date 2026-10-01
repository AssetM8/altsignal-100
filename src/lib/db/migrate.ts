import path from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { getClient, getDb } from "./client";

export async function runMigrations(url?: string): Promise<void> {
  const client = getClient(url);
  await client.execute("PRAGMA journal_mode = WAL");
  await client.execute("PRAGMA foreign_keys = ON");
  await migrate(getDb(url), { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
}
