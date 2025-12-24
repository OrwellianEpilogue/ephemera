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

  // Download source tracking
  downloadSource: text("download_source", {
    enum: ["web", "indexer", "api"],
  })
    .notNull()
    .default("web"),

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

  // Slow download countdown
  countdownSeconds: integer("countdown_seconds"), // detected countdown duration
  countdownStartedAt: integer("countdown_started_at"), // milliseconds timestamp when countdown began

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

  // Post-download actions (checkboxes)
  postDownloadMoveToIngest: integer("post_download_move_to_ingest", {
    mode: "boolean",
  })
    .notNull()
    .default(true),
  postDownloadUploadToBooklore: integer("post_download_upload_to_booklore", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  postDownloadMoveToIndexer: integer("post_download_move_to_indexer", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  postDownloadDeleteTemp: integer("post_download_delete_temp", {
    mode: "boolean",
  })
    .notNull()
    .default(true),

  // Legacy field - will be removed after migration
  postDownloadAction: text("post_download_action", {
    enum: ["move_only", "upload_only", "both"],
  }),

  bookRetentionDays: integer("book_retention_days").notNull().default(30),
  bookSearchCacheDays: integer("book_search_cache_days").notNull().default(7),
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

export const indexerSettings = sqliteTable("indexer_settings", {
  id: integer("id").primaryKey().default(1),

  // Base URL for both services (configurable)
  baseUrl: text("base_url").notNull().default("http://localhost:8286"),

  // Newznab settings
  newznabEnabled: integer("newznab_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  newznabApiKey: text("newznab_api_key"),

  // SABnzbd settings
  sabnzbdEnabled: integer("sabnzbd_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  sabnzbdApiKey: text("sabnzbd_api_key"),

  // Indexer download directories
  indexerCompletedDir: text("indexer_completed_dir")
    .notNull()
    .default("/downloads/complete"),
  indexerIncompleteDir: text("indexer_incomplete_dir")
    .notNull()
    .default("/downloads/incomplete"),
  indexerCategoryDir: integer("indexer_category_dir", { mode: "boolean" })
    .notNull()
    .default(false),

  // Indexer-only mode - only show indexer downloads in SABnzbd APIs
  indexerOnlyMode: integer("indexer_only_mode", { mode: "boolean" })
    .notNull()
    .default(false),

  // Timestamps
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const emailSettings = sqliteTable("email_settings", {
  id: integer("id").primaryKey().default(1),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port").notNull().default(587),
  smtpUser: text("smtp_user"),
  smtpPassword: text("smtp_password"),
  senderEmail: text("sender_email"),
  senderName: text("sender_name"),
  useTls: integer("use_tls", { mode: "boolean" }).notNull().default(true),
  updatedAt: integer("updated_at").notNull(),
});

export const emailRecipients = sqliteTable("email_recipients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull(),
  name: text("name"),
  createdAt: integer("created_at").notNull(),
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
export type IndexerSettings = typeof indexerSettings.$inferSelect;
export type NewIndexerSettings = typeof indexerSettings.$inferInsert;
export type EmailSettings = typeof emailSettings.$inferSelect;
export type NewEmailSettings = typeof emailSettings.$inferInsert;
export type EmailRecipient = typeof emailRecipients.$inferSelect;
export type NewEmailRecipient = typeof emailRecipients.$inferInsert;
