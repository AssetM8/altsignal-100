import { runMigrations } from "@/lib/db/migrate";

await runMigrations();
console.info("✓ migrations applied");
