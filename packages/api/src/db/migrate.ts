import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { dirname } from "path";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = process.env.DB_PATH || "./data/database.db";
console.log(`Database path: ${dbPath}`);

// Ensure directory exists
mkdirSync(dirname(dbPath), { recursive: true });

// Initialize database
const sqlite = new Database(dbPath);
const db = drizzle(sqlite);

// Run migrations
const migrationsFolder = join(__dirname, "../../src/db/migrations");
console.log(`Running migrations from: ${migrationsFolder}`);

try {
  migrate(db, { migrationsFolder });
  console.log("✓ Migrations completed successfully");
} catch (error) {
  console.error("✗ Migration failed:", error);
  process.exit(1);
} finally {
  sqlite.close();
}
