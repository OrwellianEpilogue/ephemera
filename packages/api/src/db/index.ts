import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema.js";
import { mkdir } from "fs/promises";
import { dirname } from "path";
import { bookloreSettings } from "./schema.js";

const dbPath = process.env.DB_PATH || "./data/downloads.db";

// Ensure data directory exists
await mkdir(dirname(dbPath), { recursive: true });

// Initialize SQLite database
const sqlite = new Database(dbPath);

// Enable WAL mode for better concurrent access
sqlite.pragma("journal_mode = WAL");

// Create Drizzle instance
export const db = drizzle(sqlite, { schema });

// Initialize database with default data
export async function initializeDatabase() {
  try {
    // Initialize default Booklore settings (disabled by default)
    try {
      const existingSettings = await db
        .select()
        .from(bookloreSettings)
        .limit(1);
      if (existingSettings.length === 0) {
        console.log("Initializing default Booklore settings (disabled)...");
        await db.insert(bookloreSettings).values({
          id: 1,
          enabled: false,
          autoUpload: true,
          updatedAt: Date.now(),
        });
      }
    } catch (_error) {
      // Non-critical: Booklore settings are optional
      console.warn(
        "Note: Booklore settings initialization skipped (table may not exist yet)",
      );
    }

    console.log("Database initialized successfully");
  } catch (error) {
    console.error("Failed to initialize database:", error);
    throw error;
  }
}

// Cleanup expired cache entries
export async function cleanupExpiredCache() {
  try {
    sqlite
      .prepare("DELETE FROM search_cache WHERE expires_at < ?")
      .run(Date.now());
  } catch (error) {
    console.error("Failed to cleanup cache:", error);
  }
}
