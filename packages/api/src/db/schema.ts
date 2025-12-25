import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import type { RequestQueryParams } from "@ephemera/shared";

// Better Auth tables
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .default(false)
    .notNull(),
  image: text("image"),
  role: text("role", { enum: ["admin", "user"] })
    .notNull()
    .default("user"),
  banned: integer("banned", { mode: "boolean" }).default(false).notNull(),
  banReason: text("ban_reason"),
  banExpiresAt: integer("ban_expires_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .$onUpdate(() => new Date())
    .notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", {
    mode: "timestamp_ms",
  }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", {
    mode: "timestamp_ms",
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .$onUpdate(() => new Date())
    .notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

// SSO Provider (for OIDC/OAuth2 providers)
export const ssoProvider = sqliteTable("sso_provider", {
  id: text("id").primaryKey(),
  providerId: text("provider_id").notNull().unique(),
  name: text("name"), // Display name for the provider
  issuer: text("issuer").notNull(),
  oidcConfig: text("oidc_config").notNull(), // JSON string with clientId, clientSecret, etc.
  domain: text("domain"), // Optional domain for email-based routing
  allowAutoProvision: integer("allow_auto_provision", { mode: "boolean" })
    .default(false)
    .notNull(), // If false, users must exist before OIDC login
  organizationId: text("organization_id"), // Optional, for multi-tenant support
  userId: text("user_id"), // Who created this provider
  enabled: integer("enabled", { mode: "boolean" }).default(true).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

// Multi-user extension tables
export const userPermissions = sqliteTable("user_permissions", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  canDeleteDownloads: integer("can_delete_downloads", { mode: "boolean" })
    .notNull()
    .default(false),
  canConfigureNotifications: integer("can_configure_notifications", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  canManageRequests: integer("can_manage_requests", { mode: "boolean" })
    .notNull()
    .default(true),
  canConfigureApp: integer("can_configure_app", { mode: "boolean" })
    .notNull()
    .default(false),
  canConfigureIntegrations: integer("can_configure_integrations", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  canConfigureEmail: integer("can_configure_email", { mode: "boolean" })
    .notNull()
    .default(false),
});

export const appConfig = sqliteTable("app_config", {
  id: integer("id").primaryKey().default(1),
  isSetupComplete: integer("is_setup_complete", { mode: "boolean" })
    .notNull()
    .default(false),
  authMethod: text("auth_method"),
  searcherBaseUrl: text("searcher_base_url"),
  searcherApiKey: text("searcher_api_key"),
  quickBaseUrl: text("quick_base_url"),
  downloadFolder: text("download_folder").notNull().default("./downloads"),
  ingestFolder: text("ingest_folder").notNull().default("/path/to/final/books"),
  retryAttempts: integer("retry_attempts").notNull().default(3),
  requestTimeout: integer("request_timeout").notNull().default(30000),
  searchCacheTtl: integer("search_cache_ttl").notNull().default(300),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

export const calibreConfig = sqliteTable("calibre_config", {
  id: integer("id").primaryKey().default(1),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  dbPath: text("db_path"),
  baseUrl: text("base_url"),
});

export const downloads = sqliteTable("downloads", {
  md5: text("md5").primaryKey(),
  title: text("title").notNull(),
  filename: text("filename"),
  author: text("author"),
  publisher: text("publisher"),
  language: text("language"),
  format: text("format"),
  year: integer("year"),

  // User ownership
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

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

  // User ownership
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

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
  autoSend: integer("auto_send", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
});

// Relations
export const userRelations = relations(user, ({ many, one }) => ({
  sessions: many(session),
  accounts: many(account),
  downloads: many(downloads),
  downloadRequests: many(downloadRequests),
  permissions: one(userPermissions, {
    fields: [user.id],
    references: [userPermissions.userId],
  }),
}));

export const userPermissionsRelations = relations(
  userPermissions,
  ({ one }) => ({
    user: one(user, {
      fields: [userPermissions.userId],
      references: [user.id],
    }),
  }),
);

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const booksRelations = relations(books, ({ many }) => ({
  downloads: many(downloads),
  downloadRequests: many(downloadRequests),
}));

export const downloadsRelations = relations(downloads, ({ one }) => ({
  book: one(books, {
    fields: [downloads.md5],
    references: [books.md5],
  }),
  user: one(user, {
    fields: [downloads.userId],
    references: [user.id],
  }),
}));

export const downloadRequestsRelations = relations(
  downloadRequests,
  ({ one }) => ({
    fulfilledBook: one(books, {
      fields: [downloadRequests.fulfilledBookMd5],
      references: [books.md5],
    }),
    user: one(user, {
      fields: [downloadRequests.userId],
      references: [user.id],
    }),
  }),
);

// Better Auth types
export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Session = typeof session.$inferSelect;
export type NewSession = typeof session.$inferInsert;
export type Account = typeof account.$inferSelect;
export type NewAccount = typeof account.$inferInsert;
export type Verification = typeof verification.$inferSelect;
export type NewVerification = typeof verification.$inferInsert;

// Multi-user extension types
export type UserPermissions = typeof userPermissions.$inferSelect;
export type NewUserPermissions = typeof userPermissions.$inferInsert;
export type AppConfig = typeof appConfig.$inferSelect;
export type NewAppConfig = typeof appConfig.$inferInsert;
export type CalibreConfig = typeof calibreConfig.$inferSelect;
export type NewCalibreConfig = typeof calibreConfig.$inferInsert;

// Existing types
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
