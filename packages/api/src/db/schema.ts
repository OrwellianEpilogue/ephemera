import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import type { RequestQueryParams } from "@ephemera/shared";

export const downloads = sqliteTable("downloads", {
  md5: text("md5").primaryKey(),
  title: text("title").notNull(),
  filename: text("filename"),
  author: text("author"),
  publisher: text("publisher"),
  language: text("language"),
  format: text("format"),
  year: integer("year"),

  // Status tracking
  status: text("status", {
    enum: [
      "queued",
      "downloading",
      "done",
      "available",
      "error",
      "cancelled",
      "delayed",
    ],
  }).notNull(),

  // Download metadata
  size: integer("size"), // bytes
  downloadedBytes: integer("downloaded_bytes").default(0),
  progress: real("progress").default(0), // 0-100
  speed: text("speed"), // e.g., "2.5 MB/s"
  eta: integer("eta"), // seconds remaining

  // File paths
  tempPath: text("temp_path"),
  finalPath: text("final_path"),

  // Error tracking
  error: text("error"),
  retryCount: integer("retry_count").default(0),

  // Delayed retry tracking (for quota exhaustion)
  delayedRetryCount: integer("delayed_retry_count").default(0),
  nextRetryAt: integer("next_retry_at"), // milliseconds timestamp for next retry attempt

  // AA quota tracking
  downloadsLeft: integer("downloads_left"),
  downloadsPerDay: integer("downloads_per_day"),
  quotaCheckedAt: integer("quota_checked_at"), // milliseconds timestamp

  // Timestamps (stored as milliseconds)
  queuedAt: integer("queued_at").notNull(),
  startedAt: integer("started_at"),
  completedAt: integer("completed_at"),

  // AA specific
  pathIndex: integer("path_index"),
  domainIndex: integer("domain_index"),

  // Optional Booklore upload tracking (only populated if Booklore enabled)
  uploadStatus: text("upload_status", {
    enum: ["pending", "uploading", "completed", "failed"],
  }),
  uploadedAt: integer("uploaded_at"),
  uploadError: text("upload_error"),
});

export const bookloreSettings = sqliteTable("booklore_settings", {
  id: integer("id").primaryKey().default(1),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  baseUrl: text("base_url"),

  // OAuth2 tokens
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),

  // Token management
  accessTokenExpiresAt: integer("access_token_expires_at"), // milliseconds timestamp
  refreshTokenExpiresAt: integer("refresh_token_expires_at"), // milliseconds timestamp
  lastTokenRefresh: integer("last_token_refresh"), // milliseconds timestamp

  libraryId: integer("library_id"),
  pathId: integer("path_id"),
  autoUpload: integer("auto_upload", { mode: "boolean" })
    .notNull()
    .default(true),
  updatedAt: integer("updated_at").notNull(),
});

export const appSettings = sqliteTable("app_settings", {
  id: integer("id").primaryKey().default(1),
  postDownloadAction: text("post_download_action", {
    enum: ["move_only", "upload_only", "both"],
  })
    .notNull()
    .default("both"),
  bookRetentionDays: integer("book_retention_days").notNull().default(30),
  requestCheckInterval: text("request_check_interval", {
    enum: ["1min", "15min", "30min", "1h", "6h", "12h", "24h", "weekly"],
  })
    .notNull()
    .default("6h"),
  timeFormat: text("time_format", {
    enum: ["24h", "ampm"],
  })
    .notNull()
    .default("24h"),
  dateFormat: text("date_format", {
    enum: ["us", "eur"],
  })
    .notNull()
    .default("eur"),
  libraryUrl: text("library_url"),
  libraryLinkLocation: text("library_link_location", {
    enum: ["sidebar", "header", "both"],
  })
    .notNull()
    .default("sidebar"),
  updatedAt: integer("updated_at").notNull(),
});

export const searchCache = sqliteTable("search_cache", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  queryHash: text("query_hash").notNull().unique(),
  query: text("query", { mode: "json" })
    .notNull()
    .$type<Record<string, unknown>>(),
  results: text("results", { mode: "json" })
    .notNull()
    .$type<Array<Record<string, unknown>>>(),
  pagination: text("pagination", { mode: "json" })
    .notNull()
    .$type<Record<string, unknown>>(),
  cachedAt: integer("cached_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const books = sqliteTable("books", {
  md5: text("md5").primaryKey(),

  // Book metadata
  title: text("title").notNull(),
  authors: text("authors", { mode: "json" }).$type<string[]>(),
  publisher: text("publisher"),
  description: text("description"),
  coverUrl: text("cover_url"),
  filename: text("filename"),
  language: text("language"),
  format: text("format"),
  size: integer("size"), // bytes
  year: integer("year"),
  contentType: text("content_type"),
  source: text("source"),

  // AA metadata
  saves: integer("saves"),
  lists: integer("lists"),
  issues: integer("issues"),

  // Tracking metadata
  searchCount: integer("search_count").notNull().default(0),
  firstSeenAt: integer("first_seen_at").notNull(),
  lastSeenAt: integer("last_seen_at").notNull(),
});

export const downloadRequests = sqliteTable("download_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),

  // Search parameters (stores the full search query)
  queryParams: text("query_params", { mode: "json" })
    .notNull()
    .$type<RequestQueryParams>(),

  // Status tracking
  status: text("status", {
    enum: ["active", "fulfilled", "cancelled"],
  })
    .notNull()
    .default("active"),

  // Timestamps (stored as milliseconds)
  createdAt: integer("created_at").notNull(),
  lastCheckedAt: integer("last_checked_at"),
  fulfilledAt: integer("fulfilled_at"),

  // Reference to fulfilled book (if found)
  fulfilledBookMd5: text("fulfilled_book_md5"),
});

export const appriseSettings = sqliteTable("apprise_settings", {
  id: integer("id").primaryKey().default(1),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  serverUrl: text("server_url"),
  customHeaders: text("custom_headers", { mode: "json" }).$type<
    Record<string, string>
  >(),

  // Notification toggles
  notifyOnNewRequest: integer("notify_on_new_request", { mode: "boolean" })
    .notNull()
    .default(true),
  notifyOnDownloadError: integer("notify_on_download_error", {
    mode: "boolean",
  })
    .notNull()
    .default(true),
  notifyOnAvailable: integer("notify_on_available", { mode: "boolean" })
    .notNull()
    .default(true),
  notifyOnDelayed: integer("notify_on_delayed", { mode: "boolean" })
    .notNull()
    .default(true),
  notifyOnUpdateAvailable: integer("notify_on_update_available", {
    mode: "boolean",
  })
    .notNull()
    .default(true),
  notifyOnRequestFulfilled: integer("notify_on_request_fulfilled", {
    mode: "boolean",
  })
    .notNull()
    .default(true),
  notifyOnBookQueued: integer("notify_on_book_queued", { mode: "boolean" })
    .notNull()
    .default(false),

  updatedAt: integer("updated_at").notNull(),
});

// Relations
export const booksRelations = relations(books, ({ many }) => ({
  downloads: many(downloads),
  downloadRequests: many(downloadRequests),
}));

export const downloadsRelations = relations(downloads, ({ one }) => ({
  book: one(books, {
    fields: [downloads.md5],
    references: [books.md5],
  }),
}));

export const downloadRequestsRelations = relations(
  downloadRequests,
  ({ one }) => ({
    fulfilledBook: one(books, {
      fields: [downloadRequests.fulfilledBookMd5],
      references: [books.md5],
    }),
  }),
);

export type Download = typeof downloads.$inferSelect;
export type NewDownload = typeof downloads.$inferInsert;
export type SearchCache = typeof searchCache.$inferSelect;
export type NewSearchCache = typeof searchCache.$inferInsert;
export type BookloreSettings = typeof bookloreSettings.$inferSelect;
export type NewBookloreSettings = typeof bookloreSettings.$inferInsert;
export type AppSettings = typeof appSettings.$inferSelect;
export type NewAppSettings = typeof appSettings.$inferInsert;
export type Book = typeof books.$inferSelect;
export type NewBook = typeof books.$inferInsert;
export type DownloadRequest = typeof downloadRequests.$inferSelect;
export type NewDownloadRequest = typeof downloadRequests.$inferInsert;
export type AppriseSettings = typeof appriseSettings.$inferSelect;
export type NewAppriseSettings = typeof appriseSettings.$inferInsert;
