import { Hono, Context } from "hono";
import { z } from "zod";
import { indexerSettingsService } from "../services/indexer-settings.js";
import { sabnzbdMapper } from "../services/sabnzbd-mapper.js";
import { nzbParser } from "../services/nzb-parser.js";
import { queueManager } from "../services/queue-manager.js";
import { downloadTracker } from "../services/download-tracker.js";

const sabnzbd = new Hono();

// Common query parameters
const baseQuerySchema = z.object({
  mode: z.string(),
  apikey: z.string().optional(),
  output: z.enum(["json", "xml"]).optional().default("json"),
});

/**
 * Main SABnzbd API endpoint - handles both GET and POST
 */
const handleSabnzbdApi = async (c: Context) => {
  // Check if SABnzbd is enabled
  const settings = await indexerSettingsService.getSettings();
  if (!settings.sabnzbdEnabled) {
    c.status(404);
    return c.text("Not Found");
  }

  // Parse query parameters (GET) or form data (POST)
  const isPost = c.req.method === "POST";
  let params: Record<string, unknown>;

  // For POST requests, we need to merge query parameters with form data
  // because SABnzbd sends mode, apikey, etc. as query params even for POST
  const queryParams = c.req.query();

  if (isPost) {
    const contentType = c.req.header("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      // Handle multipart form data (for file uploads)
      const formData = await c.req.parseBody();
      // Merge query params with form data
      params = { ...queryParams, ...formData };
    } else {
      // Handle regular form data
      const formData = await c.req.parseBody();
      // Merge query params with form data
      params = { ...queryParams, ...formData };
    }
  } else {
    params = queryParams;
  }

  // Validate base parameters
  const baseParams = baseQuerySchema.safeParse(params);
  if (!baseParams.success) {
    return c.json({ error: "Missing required parameters" }, 400);
  }

  const { mode, apikey, output } = baseParams.data;

  // Check API key for protected endpoints
  const protectedModes = [
    "queue",
    "history",
    "addfile",
    "addurl",
    "pause",
    "resume",
    "delete",
    "pause_pp",
    "resume_pp",
    "shutdown",
    "restart",
  ];

  if (protectedModes.includes(mode) && apikey !== settings.sabnzbdApiKey) {
    return c.json({ error: "API Key Incorrect" }, 401);
  }

  // Handle different modes
  switch (mode) {
    case "version":
      return c.json(sabnzbdMapper.formatVersionResponse(output));

    case "queue": {
      const queueResponse = await sabnzbdMapper.formatQueueResponse(output);
      return output === "xml"
        ? c.text(queueResponse as string, 200, {
            "Content-Type": "application/xml",
          })
        : c.json(queueResponse);
    }

    case "history": {
      const start = parseInt(params.start as string) || 0;
      const limit = parseInt(params.limit as string) || 50;
      const historyResponse = await sabnzbdMapper.formatHistoryResponse(
        start,
        limit,
        output,
      );
      return output === "xml"
        ? c.text(historyResponse as string, 200, {
            "Content-Type": "application/xml",
          })
        : c.json(historyResponse);
    }

    case "addfile": {
      // Handle NZB file upload
      // SABnzbd uses 'name' field for the uploaded file
      const nzbFile = params.name || params.nzbfile;

      if (!isPost || !nzbFile) {
        console.error(
          "addfile: No file uploaded, params:",
          Object.keys(params),
        );
        return c.json({ error: "No file uploaded" }, 400);
      }

      try {
        // Get the uploaded file
        const file = nzbFile as { text: () => Promise<string> };
        const nzbContent = await file.text();

        // Validate NZB
        if (!nzbParser.isValidNzb(nzbContent)) {
          return c.json({ error: "Invalid NZB file" }, 400);
        }

        // Extract MD5 from NZB
        const md5 = nzbParser.extractMd5(nzbContent);
        if (!md5) {
          return c.json({ error: "Could not extract book MD5 from NZB" }, 400);
        }

        // Add to download queue with indexer source
        await queueManager.addToQueue(md5, "indexer");

        return c.json({
          status: true,
          nzo_ids: [md5],
        });
      } catch (error) {
        console.error("Error processing NZB upload:", error);
        return c.json({ error: "Failed to process NZB file" }, 500);
      }
    }

    case "addurl": {
      // Handle NZB URL download
      const nzbUrl = params.name || params.url;
      if (!nzbUrl) {
        return c.json({ error: "No URL provided" }, 400);
      }

      try {
        // Download NZB from URL
        const response = await fetch(nzbUrl as string);
        if (!response.ok) {
          return c.json({ error: "Failed to download NZB from URL" }, 400);
        }

        const nzbContent = await response.text();

        // Validate NZB
        if (!nzbParser.isValidNzb(nzbContent)) {
          return c.json({ error: "Invalid NZB file" }, 400);
        }

        // Extract MD5 from NZB
        const md5 = nzbParser.extractMd5(nzbContent);
        if (!md5) {
          return c.json({ error: "Could not extract book MD5 from NZB" }, 400);
        }

        // Add to download queue with indexer source
        await queueManager.addToQueue(md5, "indexer");

        return c.json({
          status: true,
          nzo_ids: [md5],
        });
      } catch (error) {
        console.error("Error processing NZB URL:", error);
        return c.json({ error: "Failed to process NZB URL" }, 500);
      }
    }

    case "pause": {
      // Pause a download or all downloads
      const pauseId = params.value as string;
      if (pauseId) {
        // Pause specific download
        const download = await downloadTracker.getByMd5(pauseId);
        if (download && download.status === "downloading") {
          // Update status to delayed (paused)
          await downloadTracker.updateStatus(pauseId, "delayed");
        }
      } else {
        // Pause all downloads
        const activeDownloads = await downloadTracker.getByStatuses([
          "downloading",
        ]);
        for (const download of activeDownloads) {
          await downloadTracker.updateStatus(download.md5, "delayed");
        }
      }
      return c.json({ status: true });
    }

    case "resume": {
      // Resume a download or all downloads
      const resumeId = params.value as string;
      if (resumeId) {
        // Resume specific download
        const download = await downloadTracker.getByMd5(resumeId);
        if (download && download.status === "delayed") {
          // Update status back to queued
          await downloadTracker.updateStatus(resumeId, "queued");
          // Re-queue the download
          await queueManager.addToQueue(resumeId, "indexer");
        }
      } else {
        // Resume all paused downloads
        const pausedDownloads = await downloadTracker.getByStatuses([
          "delayed",
        ]);
        for (const download of pausedDownloads) {
          await downloadTracker.updateStatus(download.md5, "queued");
          await queueManager.addToQueue(download.md5, "indexer");
        }
      }
      return c.json({ status: true });
    }

    case "delete": {
      // Delete/cancel a download
      const deleteId = params.value as string;
      if (!deleteId) {
        return c.json({ error: "No ID provided" }, 400);
      }

      const download = await downloadTracker.getByMd5(deleteId);
      if (download) {
        // Cancel the download
        await downloadTracker.updateStatus(deleteId, "cancelled");
        // Remove from queue if present
        queueManager.removeFromQueue(deleteId);
      }
      return c.json({ status: true });
    }

    case "get_config":
      // Return comprehensive configuration matching real SABnzbd
      return c.json({
        config: {
          misc: {
            // Network settings
            port: 8286,
            https_port: "",
            username: "",
            password: "",
            api_key: settings.sabnzbdApiKey,
            nzb_key: settings.sabnzbdApiKey,
            url_base: "/sabnzbd",
            host: "0.0.0.0",
            refresh_rate: 1,
            complete_dir: settings.indexerCompletedDir,
            incomplete_dir: settings.indexerIncompleteDir,
            download_dir: settings.indexerIncompleteDir,
            download_free: "",
            complete_free: "",
            dirscan_dir: "",
            script_dir: "",
            log_dir: "/var/log",
            admin_dir: "",
            nzb_backup_dir: "",

            // UI settings
            web_dir: "Glitter",
            web_color: "Auto",
            language: "en",

            // Processing settings
            direct_unpack: true,
            propagation_delay: 0,
            folder_rename: 1,
            replace_spaces: 0,
            replace_underscores: 0,
            replace_dots: 0,
            safe_postproc: 1,
            pause_on_post_processing: 0,

            // Performance settings
            bandwidth_perc: 0,
            bandwidth_max: "",
            cache_limit: "1G",

            // Feature flags
            enable_recursive: 1,
            flat_unpack: 0,
            par_option: "",
            pre_check: 0,
            sfv_check: 1,
            script_can_fail: 0,

            // Queue settings
            queue_complete: "",
            queue_complete_pers: 0,
            queue_limit: 20,

            // Duplicate handling
            no_dupes: 0,
            no_series_dupes: 0,
            no_smart_dupes: 0,

            // History settings
            history_retention: "",
            history_limit: 10,

            // Other important settings
            auto_disconnect: 1,
            pre_script: "None",
            end_queue_script: "None",
            enable_https: 0,
            inet_exposure: 0,
            permissions: "",
            auto_browser: 0,
            enable_7zip: 1,
            enable_unrar: 1,
            enable_par_cleanup: 1,
            fail_hopeless_jobs: 1,
            top_only: 0,
            win_process_prio: 3,
            ionice: "",
            nice: "",

            // Version info
            version: "4.3.3",

            // Additional fields for compatibility
            start_paused: 0,
            pause_on_pwrar: 1,
            ignore_samples: 0,
            deobfuscate_final_filenames: 1,
            auto_sort: "",
            direct_unpack_threads: 3,
            max_art_tries: 3,
          },
          categories: [
            {
              name: "*",
              order: 0,
              pp: "3",
              script: "None",
              dir: "",
              newzbin: "",
              priority: 0,
            },
            {
              name: "ephemera",
              order: 1,
              pp: "D",
              script: "None",
              dir: settings.indexerCategoryDir ? "ephemera" : "",
              newzbin: "",
              priority: -100,
            },
          ],
          servers: [],
        },
      });

    case "warnings":
      // Return empty warnings
      return c.json({
        warnings: [],
      });

    case "get_cats":
      // Return categories
      return c.json({
        categories: ["ephemera", "Default"],
      });

    case "scripts":
      // Return empty scripts list
      return c.json({
        scripts: [],
      });

    case "get_scripts":
      // Return empty scripts list
      return c.json({
        scripts: [],
      });

    case "fullstatus": {
      const fullQueueResponse = await sabnzbdMapper.formatQueueResponse("json");
      const fullHistoryResponse = await sabnzbdMapper.formatHistoryResponse(
        0,
        10,
        "json",
      );

      const queueData = fullQueueResponse as {
        queue?: {
          paused?: boolean;
          kbpersec?: string;
          speed?: string;
          mbleft?: string;
          mb?: string;
          sizeleft?: string;
          size?: string;
          eta?: string;
          timeleft?: string;
          noofslots_total?: number;
          noofslots?: number;
          limit?: number;
          finish?: number;
          status?: string;
          slots?: unknown[];
          categories?: string[];
        };
      };

      const historyData = fullHistoryResponse as {
        history?: {
          last_history_update?: number;
        };
      };

      const fullStatus = {
        status: {
          version: "4.3.3",
          paused: queueData.queue?.paused || false,
          pause_int: "0",
          paused_all: false,
          diskspace1: "100.0",
          diskspace2: "100.0",
          diskspace1_norm: "100 GB",
          diskspace2_norm: "100 GB",
          loadavg: "0.00, 0.00, 0.00",
          speedlimit: "0",
          speedlimit_abs: "",
          have_warnings: "0",
          finishaction: null,
          quota: "",
          left_quota: "",
          cache_art: "0",
          cache_size: "0 B",
          kbpersec: queueData.queue?.kbpersec || "0",
          speed: queueData.queue?.speed || "0 B/s",
          mbleft: queueData.queue?.mbleft || "0",
          mb: queueData.queue?.mb || "0",
          sizeleft: queueData.queue?.sizeleft || "0 B",
          size: queueData.queue?.size || "0 B",
          eta: queueData.queue?.eta || "unknown",
          timeleft: queueData.queue?.timeleft || "0:00:00",
          noofslots_total: queueData.queue?.noofslots_total || 0,
          noofslots: queueData.queue?.noofslots || 0,
          start: 0,
          limit: queueData.queue?.limit || 0,
          finish: queueData.queue?.finish || 0,
          status: queueData.queue?.status || "Idle",
          slots: queueData.queue?.slots || [],
          categories: queueData.queue?.categories || ["*", "ephemera"],
          scripts: [],
          servers: [],
          warnings: [],
          rating_enable: false,
          new_release: "",
          new_rel_url: "",
          darwin: false,
          nt: false,
          color_scheme: "auto",
          refresh_rate: 1,
          helpuri: "",
          uptime: "0",
          my_home: "",
          my_lcldata: "",
          webdir: "",
          url_base: "/sabnzbd",
          complete_dir: settings.indexerCompletedDir,
          incomplete_dir: settings.indexerIncompleteDir,
          download_dir: settings.indexerIncompleteDir,
          last_history_update: historyData.history?.last_history_update || 0,
        },
        queue: queueData.queue,
        history: historyData.history,
      };

      return output === "xml"
        ? c.text(sabnzbdMapper.jsonToXml(fullStatus), 200, {
            "Content-Type": "application/xml",
          })
        : c.json(fullStatus);
    }

    case "pause_pp":
    case "resume_pp":
      // Post-processing pause/resume (no-op for us)
      return c.json({ status: true });

    case "shutdown":
    case "restart":
      // These would normally shutdown/restart SABnzbd
      // For our fake implementation, just return success
      return c.json({ status: true });

    default:
      return c.json({ error: `Unknown mode: ${mode}` }, 400);
  }
};

// Register both GET and POST handlers
sabnzbd.get("/api", handleSabnzbdApi);
sabnzbd.post("/api", handleSabnzbdApi);

export default sabnzbd;
