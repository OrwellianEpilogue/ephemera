/**
 * Migration script to copy environment variables to the database
 * Run this after the Phase 1 database migration to populate app_config
 * with values from your .env file
 */

import "dotenv/config";
import { db } from "../db/index.js";
import { appConfig } from "../db/schema.js";
import { eq } from "drizzle-orm";

async function migrateEnvToDb() {
  console.log("Starting environment variable migration to database...\n");

  try {
    // Check if app_config exists
    const existing = await db
      .select()
      .from(appConfig)
      .where(eq(appConfig.id, 1))
      .limit(1);

    if (existing.length === 0) {
      console.error("❌ Error: app_config record not found!");
      console.error("Please run database migrations first: pnpm db:migrate\n");
      process.exit(1);
    }

    const config = existing[0];
    console.log("Current app_config values:");
    console.log(JSON.stringify(config, null, 2));
    console.log("\n");

    // Prepare update values from environment variables
    const updates: Partial<typeof config> = {};

    if (process.env.AA_BASE_URL) {
      updates.searcherBaseUrl = process.env.AA_BASE_URL;
      console.log(
        `✓ AA_BASE_URL → searcherBaseUrl: ${process.env.AA_BASE_URL}`,
      );
    }

    if (process.env.AA_API_KEY) {
      updates.searcherApiKey = process.env.AA_API_KEY;
      console.log(
        `✓ AA_API_KEY → searcherApiKey: ${process.env.AA_API_KEY.substring(0, 10)}...`,
      );
    }

    if (process.env.LG_BASE_URL) {
      updates.quickBaseUrl = process.env.LG_BASE_URL;
      console.log(`✓ LG_BASE_URL → quickBaseUrl: ${process.env.LG_BASE_URL}`);
    }

    if (process.env.DOWNLOAD_FOLDER) {
      updates.downloadFolder = process.env.DOWNLOAD_FOLDER;
      console.log(
        `✓ DOWNLOAD_FOLDER → downloadFolder: ${process.env.DOWNLOAD_FOLDER}`,
      );
    }

    if (process.env.INGEST_FOLDER) {
      updates.ingestFolder = process.env.INGEST_FOLDER;
      console.log(
        `✓ INGEST_FOLDER → ingestFolder: ${process.env.INGEST_FOLDER}`,
      );
    }

    if (process.env.RETRY_ATTEMPTS) {
      updates.retryAttempts = parseInt(process.env.RETRY_ATTEMPTS, 10);
      console.log(
        `✓ RETRY_ATTEMPTS → retryAttempts: ${process.env.RETRY_ATTEMPTS}`,
      );
    }

    if (process.env.REQUEST_TIMEOUT) {
      updates.requestTimeout = parseInt(process.env.REQUEST_TIMEOUT, 10);
      console.log(
        `✓ REQUEST_TIMEOUT → requestTimeout: ${process.env.REQUEST_TIMEOUT}`,
      );
    }

    if (process.env.SEARCH_CACHE_TTL) {
      updates.searchCacheTtl = parseInt(process.env.SEARCH_CACHE_TTL, 10);
      console.log(
        `✓ SEARCH_CACHE_TTL → searchCacheTtl: ${process.env.SEARCH_CACHE_TTL}`,
      );
    }

    if (Object.keys(updates).length === 0) {
      console.log(
        "\n⚠ No environment variables found to migrate. Skipping update.\n",
      );
      console.log("Environment variables that can be migrated:");
      console.log("  - AA_BASE_URL");
      console.log("  - AA_API_KEY");
      console.log("  - LG_BASE_URL");
      console.log("  - DOWNLOAD_FOLDER");
      console.log("  - INGEST_FOLDER");
      console.log("  - RETRY_ATTEMPTS");
      console.log("  - REQUEST_TIMEOUT");
      console.log("  - SEARCH_CACHE_TTL\n");
      return;
    }

    // Update the database
    await db.update(appConfig).set(updates).where(eq(appConfig.id, 1));

    console.log(
      "\n✅ Successfully migrated environment variables to database!",
    );
    console.log(
      "\nNOTE: You can now remove these variables from your .env file",
    );
    console.log(
      "They will be managed through the application settings UI going forward.\n",
    );
  } catch (error) {
    console.error("❌ Error during migration:", error);
    process.exit(1);
  }
}

// Run the migration
migrateEnvToDb()
  .then(() => {
    console.log("Migration completed.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });
