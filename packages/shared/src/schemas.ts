import { z } from "zod";

// Sort options from AA
export const sortOptions = [
  "relevant",
  "newest",
  "oldest",
  "largest",
  "smallest",
  "newest_added",
  "oldest_added",
  "random",
] as const;

// Helper to coerce string or array to array
const coerceArray = z
  .union([z.string(), z.array(z.string())])
  .transform((val) => (Array.isArray(val) ? val : [val]));

// Search query schema
export const searchQuerySchema = z.object({
  q: z.string().min(1).describe("Search query"),
  page: z.coerce.number().int().positive().default(1).describe("Page number"),
  sort: z
    .enum(["", ...sortOptions])
    .optional()
    .describe("Sort order"),
  content: coerceArray
    .optional()
    .describe("Content type filters (e.g., book_nonfiction, book_fiction)"),
  ext: coerceArray
    .optional()
    .describe("File extension filters (e.g., pdf, epub)"),
  acc: coerceArray
    .optional()
    .describe("Access type filters (e.g., aa_download, external_download)"),
  src: coerceArray.optional().describe("Source filters"),
  lang: coerceArray.optional().describe("Language filters (e.g., en, ru, zh)"),
  desc: z.coerce
    .boolean()
    .optional()
    .describe("Search in descriptions and metadata"),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

// Request query params schema (for download requests)
export const requestQueryParamsSchema = z.object({
  q: z.string().describe("Search query"),
  sort: z.string().optional().describe("Sort order"),
  content: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe("Content type filter"),
  ext: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe("File extension filter"),
  lang: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe("Language filter"),
  desc: z.boolean().optional().describe("Search in descriptions"),
});

export type RequestQueryParams = z.infer<typeof requestQueryParamsSchema>;

// Saved request status (for periodic checking)
export const savedRequestStatusSchema = z.enum([
  "active",
  "fulfilled",
  "cancelled",
]);
export type SavedRequestStatus = z.infer<typeof savedRequestStatusSchema>;

// Saved request schema (for periodic checking)
export const savedRequestSchema = z.object({
  id: z.number().describe("Request ID"),
  queryParams: requestQueryParamsSchema.describe("Search parameters"),
  status: savedRequestStatusSchema.describe("Request status"),
  createdAt: z.number().describe("Creation timestamp"),
  lastCheckedAt: z.number().nullable().describe("Last check timestamp"),
  fulfilledAt: z.number().nullable().describe("Fulfillment timestamp"),
  fulfilledBookMd5: z.string().nullable().describe("MD5 of fulfilled book"),
});

export type SavedRequest = z.infer<typeof savedRequestSchema>;

// Download status schema (defined before bookSchema to avoid forward reference)
export const downloadStatusSchema = z.enum([
  "queued",
  "downloading",
  "done",
  "available",
  "error",
  "cancelled",
  "delayed",
]);

export type DownloadStatus = z.infer<typeof downloadStatusSchema>;

// Book result schema
export const bookSchema = z.object({
  md5: z.string().describe("MD5 hash identifier"),
  title: z.string().describe("Book title"),
  authors: z.array(z.string()).optional().describe("List of authors"),
  publisher: z.string().optional().describe("Publisher information"),
  description: z.string().optional().describe("Book description"),
  coverUrl: z.string().url().optional().describe("Cover image URL"),
  filename: z.string().optional().describe("Filename without path"),
  language: z.string().optional().describe('Language code (e.g., "en", "ru")'),
  format: z.string().optional().describe("File format (PDF, EPUB, etc.)"),
  size: z.number().optional().describe("File size in bytes"),
  year: z.number().optional().describe("Publication year"),
  contentType: z
    .string()
    .optional()
    .describe("Content type (book, magazine, etc.)"),
  source: z.string().optional().describe("Source of the file"),
  saves: z.number().optional().describe("Number of saves"),
  lists: z.number().optional().describe("Number of lists"),
  issues: z.number().optional().describe("Number of reported issues"),
  downloadStatus: downloadStatusSchema
    .nullable()
    .optional()
    .describe("Download status if book has been queued/downloaded"),
});

export type Book = z.infer<typeof bookSchema>;

// Saved request with fulfilled book (API response type)
export const savedRequestWithBookSchema = savedRequestSchema.extend({
  fulfilledBook: bookSchema
    .nullable()
    .optional()
    .describe("Fulfilled book info if available"),
});

export type SavedRequestWithBook = z.infer<typeof savedRequestWithBookSchema>;

// Request stats schema
export const requestStatsSchema = z.object({
  active: z.number().describe("Number of active requests"),
  fulfilled: z.number().describe("Number of fulfilled requests"),
  cancelled: z.number().describe("Number of cancelled requests"),
  total: z.number().describe("Total number of requests"),
});

export type RequestStats = z.infer<typeof requestStatsSchema>;

// Search response schema
export const searchResponseSchema = z.object({
  results: z.array(bookSchema).describe("Array of book results"),
  pagination: z
    .object({
      page: z.number().describe("Current page number"),
      per_page: z.number().describe("Results per page"),
      has_next: z.boolean().describe("Whether a next page exists"),
      has_previous: z.boolean().describe("Whether a previous page exists"),
      estimated_total_results: z
        .number()
        .nullable()
        .describe('Estimated minimum total results (from "X+ total")'),
    })
    .describe("Pagination information"),
});

export type SearchResponse = z.infer<typeof searchResponseSchema>;

// Download request schema
export const downloadRequestSchema = z.object({
  pathIndex: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Path index for collection selection"),
  domainIndex: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Domain index for server selection"),
});

export type DownloadRequest = z.infer<typeof downloadRequestSchema>;

// Queue item schema
export const queueItemSchema = z.object({
  md5: z.string().describe("MD5 hash identifier"),
  title: z.string().describe("Book title"),
  status: downloadStatusSchema.describe("Current download status"),
  progress: z.number().min(0).max(100).describe("Download progress percentage"),
  downloadedBytes: z.number().optional().describe("Bytes downloaded"),
  totalBytes: z.number().optional().describe("Total bytes to download"),
  speed: z.string().optional().describe('Download speed (e.g., "2.5 MB/s")'),
  eta: z.number().optional().describe("Estimated time remaining in seconds"),
  error: z.string().optional().describe("Error message if status is error"),
  filePath: z.string().optional().describe("Final file path when available"),
  queuedAt: z.string().datetime().describe("When the download was queued"),
  startedAt: z
    .string()
    .datetime()
    .optional()
    .describe("When the download started"),
  completedAt: z
    .string()
    .datetime()
    .optional()
    .describe("When the download completed"),
  // Retry tracking
  retryCount: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Number of immediate retry attempts for transient errors"),
  delayedRetryCount: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Number of delayed retry attempts for quota errors"),
  nextRetryAt: z
    .string()
    .datetime()
    .optional()
    .describe("When the next retry is scheduled (for delayed items)"),
  // Quota tracking
  downloadsLeft: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Remaining downloads in quota"),
  downloadsPerDay: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Total daily download limit"),
  quotaCheckedAt: z
    .string()
    .datetime()
    .optional()
    .describe("When quota was last checked"),
  // Countdown tracking
  countdownSeconds: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Detected countdown duration for slow downloads in seconds"),
  countdownStartedAt: z
    .string()
    .datetime()
    .optional()
    .describe("When countdown started (for calculating remaining time)"),
  // Optional Booklore upload tracking
  uploadStatus: z
    .enum(["pending", "uploading", "completed", "failed"])
    .nullable()
    .optional()
    .describe("Upload status to Booklore (if enabled)"),
  uploadedAt: z
    .string()
    .datetime()
    .optional()
    .nullable()
    .describe("When file was uploaded to Booklore"),
  uploadError: z
    .string()
    .optional()
    .nullable()
    .describe("Upload error message if upload failed"),
  // Book metadata from books table (if available)
  authors: z
    .array(z.string())
    .optional()
    .describe("List of authors from books table"),
  publisher: z.string().optional().describe("Publisher from books table"),
  coverUrl: z
    .string()
    .url()
    .optional()
    .describe("Cover image URL from books table"),
  format: z.string().optional().describe("File format from books table"),
  language: z.string().optional().describe("Language code from books table"),
  year: z.number().optional().describe("Publication year from books table"),
  size: z.number().optional().describe("File size in bytes from books table"),
});

export type QueueItem = z.infer<typeof queueItemSchema>;

// Queue response schema
export const queueResponseSchema = z.object({
  available: z
    .record(z.string(), queueItemSchema)
    .describe("Downloads available in final folder"),
  queued: z
    .record(z.string(), queueItemSchema)
    .describe("Downloads waiting in queue"),
  downloading: z
    .record(z.string(), queueItemSchema)
    .describe("Currently downloading"),
  done: z
    .record(z.string(), queueItemSchema)
    .describe("Completed downloads in temp folder"),
  delayed: z
    .record(z.string(), queueItemSchema)
    .describe("Downloads delayed due to quota exhaustion"),
  error: z
    .record(z.string(), queueItemSchema)
    .describe("Downloads with errors"),
  cancelled: z
    .record(z.string(), queueItemSchema)
    .describe("Cancelled downloads"),
});

export type QueueResponse = z.infer<typeof queueResponseSchema>;

// Stats response schema
export const statsResponseSchema = z.object({
  total: z.number().describe("Total number of tracked downloads"),
  available: z.number().describe("Number of available downloads"),
  downloading: z.number().describe("Number of active downloads"),
  queued: z.number().describe("Number of queued downloads"),
  errors: z.number().describe("Number of failed downloads"),
  totalSize: z.string().describe("Total size of all downloads"),
  successRate: z.number().describe("Success rate percentage"),
  uploads: z
    .object({
      pending: z.number().describe("Files waiting to upload"),
      uploading: z.number().describe("Files currently uploading"),
      completed: z.number().describe("Successfully uploaded files"),
      failed: z.number().describe("Failed upload attempts"),
    })
    .optional()
    .describe(
      "Optional Booklore upload statistics (only included if Booklore has been used)",
    ),
});

export type StatsResponse = z.infer<typeof statsResponseSchema>;

// Error response schema
export const errorResponseSchema = z.object({
  error: z.string().describe("Error message"),
  code: z.string().optional().describe("Error code"),
  details: z.any().optional().describe("Additional error details"),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

// Booklore upload status schema
export const uploadStatusSchema = z.enum([
  "pending",
  "uploading",
  "completed",
  "failed",
]);

export type UploadStatus = z.infer<typeof uploadStatusSchema>;

// Booklore settings schema (internal use only - includes encrypted tokens)
export const bookloreSettingsSchema = z.object({
  id: z.number().describe("Settings ID (always 1)"),
  enabled: z.boolean().describe("Whether Booklore integration is enabled"),
  baseUrl: z.string().url().nullable().describe("Booklore API base URL"),
  accessToken: z
    .string()
    .nullable()
    .describe("Booklore access token (encrypted in database)"),
  refreshToken: z
    .string()
    .nullable()
    .describe("Booklore refresh token (encrypted in database)"),
  accessTokenExpiresAt: z
    .number()
    .int()
    .nullable()
    .describe("Access token expiration timestamp (milliseconds)"),
  refreshTokenExpiresAt: z
    .number()
    .int()
    .nullable()
    .describe("Refresh token expiration timestamp (milliseconds)"),
  lastTokenRefresh: z
    .number()
    .int()
    .nullable()
    .describe("Last token refresh timestamp (milliseconds)"),
  libraryId: z
    .number()
    .int()
    .positive()
    .nullable()
    .describe("Target library ID in Booklore"),
  pathId: z
    .number()
    .int()
    .positive()
    .nullable()
    .describe("Target path ID in Booklore library"),
  autoUpload: z
    .boolean()
    .describe("Automatically upload files after download completion"),
  updatedAt: z.string().datetime().describe("When settings were last updated"),
});

export type BookloreSettings = z.infer<typeof bookloreSettingsSchema>;

// Booklore settings response schema (shows connection status, not credentials)
export const bookloreSettingsResponseSchema = z.object({
  id: z.number().describe("Settings ID (always 1)"),
  enabled: z.boolean().describe("Whether Booklore integration is enabled"),
  baseUrl: z.string().url().nullable().describe("Booklore API base URL"),
  connected: z
    .boolean()
    .describe("Whether currently authenticated with valid tokens"),
  accessTokenExpiresAt: z
    .number()
    .int()
    .nullable()
    .describe("Access token expiration timestamp (milliseconds)"),
  refreshTokenExpiresAt: z
    .number()
    .int()
    .nullable()
    .describe("Refresh token expiration timestamp (milliseconds)"),
  lastTokenRefresh: z
    .number()
    .int()
    .nullable()
    .describe("Last token refresh timestamp (milliseconds)"),
  libraryId: z
    .number()
    .int()
    .positive()
    .nullable()
    .describe("Target library ID in Booklore"),
  pathId: z
    .number()
    .int()
    .positive()
    .nullable()
    .describe("Target path ID in Booklore library"),
  autoUpload: z
    .boolean()
    .describe("Automatically upload files after download completion"),
  updatedAt: z.string().datetime().describe("When settings were last updated"),
});

export type BookloreSettingsResponse = z.infer<
  typeof bookloreSettingsResponseSchema
>;

// Booklore settings update request schema
export const updateBookloreSettingsSchema = z
  .object({
    enabled: z
      .boolean()
      .optional()
      .describe("Enable/disable Booklore integration"),
    baseUrl: z
      .string()
      .url()
      .optional()
      .describe("Booklore API base URL (e.g., http://192.168.7.3:6060)"),
    username: z.string().min(1).optional().describe("Booklore username"),
    password: z.string().min(1).optional().describe("Booklore password"),
    libraryId: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Target library ID in Booklore"),
    pathId: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Target path ID in Booklore library"),
    autoUpload: z
      .boolean()
      .optional()
      .describe("Auto-upload files after download"),
  })
  .refine(
    (data) => {
      // If enabling, require all necessary fields
      if (data.enabled === true) {
        return (
          data.baseUrl &&
          data.username &&
          data.password &&
          data.libraryId &&
          data.pathId
        );
      }
      return true;
    },
    {
      message:
        "When enabling Booklore, baseUrl, username, password, libraryId, and pathId are required",
    },
  );

export type UpdateBookloreSettings = z.infer<
  typeof updateBookloreSettingsSchema
>;

// Booklore upload response schema
export const bookloreUploadResponseSchema = z.object({
  success: z.boolean().describe("Whether upload was successful"),
  message: z.string().describe("Success or error message"),
  uploadedAt: z
    .string()
    .datetime()
    .optional()
    .describe("When file was uploaded"),
});

export type BookloreUploadResponse = z.infer<
  typeof bookloreUploadResponseSchema
>;

// Booklore test connection response schema
export const bookloreTestResponseSchema = z.object({
  success: z.boolean().describe("Whether connection test passed"),
  message: z.string().describe("Result message"),
  baseUrl: z.string().describe("URL that was tested"),
});

export type BookloreTestResponse = z.infer<typeof bookloreTestResponseSchema>;

// Post-download action enum
export const postDownloadActionSchema = z.enum([
  "move_only",
  "upload_only",
  "both",
]);

export type PostDownloadAction = z.infer<typeof postDownloadActionSchema>;

// Time format enum
export const timeFormatSchema = z.enum(["24h", "ampm"]);

export type TimeFormat = z.infer<typeof timeFormatSchema>;

// Date format enum
export const dateFormatSchema = z.enum(["us", "eur"]);

export type DateFormat = z.infer<typeof dateFormatSchema>;

// Request check interval enum
export const requestCheckIntervalSchema = z.enum([
  "1min",
  "15min",
  "30min",
  "1h",
  "6h",
  "12h",
  "24h",
  "weekly",
]);

export type RequestCheckInterval = z.infer<typeof requestCheckIntervalSchema>;

// Library link location enum
export const libraryLinkLocationSchema = z.enum(["sidebar", "header", "both"]);

export type LibraryLinkLocation = z.infer<typeof libraryLinkLocationSchema>;

// App settings schema
export const appSettingsSchema = z.object({
  id: z.number().describe("Settings ID (always 1)"),
  postDownloadAction: postDownloadActionSchema.describe(
    "Action to perform after download completes: move_only (just move to INGEST_FOLDER), upload_only (upload to Booklore and delete file), both (move AND upload)",
  ),
  bookRetentionDays: z
    .number()
    .int()
    .min(0)
    .describe(
      "Number of days to retain books before auto-deleting them (0 = never delete, default: 30)",
    ),
  bookSearchCacheDays: z
    .number()
    .int()
    .min(0)
    .describe(
      "Number of days to retain books from search cache before auto-deleting them (0 = never delete, default: 7)",
    ),
  requestCheckInterval: requestCheckIntervalSchema.describe(
    "How often to check download requests for new results: 30min, 1h, 6h, 12h, 24h, weekly (default: 6h)",
  ),
  timeFormat: timeFormatSchema.describe(
    "Time display format: 24h (24 hours) or ampm (12 hours with AM/PM)",
  ),
  dateFormat: dateFormatSchema.describe(
    "Date display format: us (MM/DD/YYYY) or eur (DD.MM.YYYY)",
  ),
  libraryUrl: z
    .string()
    .url()
    .nullable()
    .describe(
      "URL to external library (e.g., BookLore, Calibre-Web-Automated or other book management system)",
    ),
  libraryLinkLocation: libraryLinkLocationSchema.describe(
    "Where to display the library link: sidebar or header",
  ),
  updatedAt: z.string().datetime().describe("When settings were last updated"),
});

export type AppSettings = z.infer<typeof appSettingsSchema>;

// App settings update request schema
export const updateAppSettingsSchema = z.object({
  postDownloadAction: postDownloadActionSchema
    .optional()
    .describe("Action to perform after download completes"),
  bookRetentionDays: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      "Number of days to retain books before auto-deleting them (0 = never delete)",
    ),
  bookSearchCacheDays: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      "Number of days to retain books from search cache before auto-deleting them (0 = never delete)",
    ),
  requestCheckInterval: requestCheckIntervalSchema
    .optional()
    .describe("How often to check download requests for new results"),
  timeFormat: timeFormatSchema.optional().describe("Time display format"),
  dateFormat: dateFormatSchema.optional().describe("Date display format"),
  libraryUrl: z
    .string()
    .url()
    .nullable()
    .optional()
    .describe("URL to external library"),
  libraryLinkLocation: libraryLinkLocationSchema
    .optional()
    .describe("Where to display the library link"),
});

export type UpdateAppSettings = z.infer<typeof updateAppSettingsSchema>;

// Version info schema
export const versionInfoSchema = z.object({
  currentVersion: z.string().describe("Current application version"),
  latestVersion: z
    .string()
    .nullable()
    .describe("Latest available version from GitHub"),
  updateAvailable: z.boolean().describe("Whether an update is available"),
  releaseUrl: z
    .string()
    .url()
    .nullable()
    .describe("URL to the latest release on GitHub"),
});

export type VersionInfo = z.infer<typeof versionInfoSchema>;

// Apprise notification type enum
export const appriseNotificationTypeSchema = z.enum([
  "info",
  "success",
  "warning",
  "failure",
]);

export type AppriseNotificationType = z.infer<
  typeof appriseNotificationTypeSchema
>;

// Apprise settings schema
export const appriseSettingsSchema = z.object({
  id: z.number().describe("Settings ID (always 1)"),
  enabled: z.boolean().describe("Whether Apprise notifications are enabled"),
  serverUrl: z
    .string()
    .url()
    .nullable()
    .describe("Apprise server URL (e.g., http://apprise:8111/notify/apprise)"),
  customHeaders: z
    .record(z.string(), z.string())
    .nullable()
    .describe("Custom HTTP headers to send with requests"),
  notifyOnNewRequest: z
    .boolean()
    .describe("Send notification when a new download request is created"),
  notifyOnDownloadError: z
    .boolean()
    .describe("Send notification when a download fails with an error"),
  notifyOnAvailable: z
    .boolean()
    .describe(
      "Send notification when a download completes and is moved to available",
    ),
  notifyOnDelayed: z
    .boolean()
    .describe(
      "Send notification when a download is delayed due to quota exhaustion",
    ),
  notifyOnUpdateAvailable: z
    .boolean()
    .describe("Send notification when a new version is available"),
  notifyOnRequestFulfilled: z
    .boolean()
    .describe(
      "Send notification when an automatic request search finds and queues a book",
    ),
  notifyOnBookQueued: z
    .boolean()
    .describe("Send notification when a book is added to the download queue"),
  updatedAt: z.string().datetime().describe("When settings were last updated"),
});

export type AppriseSettings = z.infer<typeof appriseSettingsSchema>;

// Apprise settings update request schema
export const updateAppriseSettingsSchema = z
  .object({
    enabled: z
      .boolean()
      .optional()
      .describe("Enable/disable Apprise notifications"),
    serverUrl: z
      .string()
      .url()
      .nullable()
      .optional()
      .describe("Apprise server URL"),
    customHeaders: z
      .record(z.string(), z.string())
      .nullable()
      .optional()
      .describe("Custom HTTP headers"),
    notifyOnNewRequest: z
      .boolean()
      .optional()
      .describe("Notify on new download request"),
    notifyOnDownloadError: z
      .boolean()
      .optional()
      .describe("Notify on download error"),
    notifyOnAvailable: z
      .boolean()
      .optional()
      .describe("Notify on download available"),
    notifyOnDelayed: z
      .boolean()
      .optional()
      .describe("Notify on download delayed"),
    notifyOnUpdateAvailable: z
      .boolean()
      .optional()
      .describe("Notify on update available"),
    notifyOnRequestFulfilled: z
      .boolean()
      .optional()
      .describe("Notify on request fulfilled"),
    notifyOnBookQueued: z
      .boolean()
      .optional()
      .describe("Notify on book queued"),
  })
  .refine(
    (data) => {
      // If enabling, require serverUrl
      if (data.enabled === true && !data.serverUrl) {
        return false;
      }
      return true;
    },
    {
      message: "When enabling Apprise, serverUrl is required",
    },
  );

export type UpdateAppriseSettings = z.infer<typeof updateAppriseSettingsSchema>;

// Apprise test response schema
export const appriseTestResponseSchema = z.object({
  success: z
    .boolean()
    .describe("Whether test notification was sent successfully"),
  message: z.string().describe("Result message"),
  serverUrl: z.string().describe("URL that was tested"),
});

export type AppriseTestResponse = z.infer<typeof appriseTestResponseSchema>;
