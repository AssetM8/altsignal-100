import fs from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

export type DB = LibSQLDatabase<typeof schema>;

const cache = new Map<string, { client: Client; db: DB }>();

export function resolveDbUrl(url = process.env.DATABASE_URL || "file:./data/altsignal.db"): string {
  if (url.startsWith("file:")) {
    const p = url.slice(5);
    const abs = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    return `file:${abs}`;
  }
  return url;
}

export function getDb(url?: string): DB {
  const resolved = resolveDbUrl(url);
  const hit = cache.get(resolved);
  if (hit) return hit.db;
  const client = createClient({ url: resolved });
  const db = drizzle(client, { schema });
  cache.set(resolved, { client, db });
  return db;
}

export function getClient(url?: string): Client {
  getDb(url);
  return (cache.get(resolveDbUrl(url)) as { client: Client }).client;
}

export function closeDb(url?: string): void {
  const resolved = resolveDbUrl(url);
  const hit = cache.get(resolved);
  if (hit) {
    hit.client.close();
    cache.delete(resolved);
  }
}
