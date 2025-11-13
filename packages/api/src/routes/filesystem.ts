import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import fs from "fs/promises";
import path from "path";

const filesystem = new OpenAPIHono();

// List directory contents
const listDirectoryRoute = createRoute({
  method: "get",
  path: "/filesystem/list",
  summary: "List directory contents",
  description: "Browse filesystem directories",
  tags: ["Filesystem"],
  request: {
    query: z.object({
      path: z.string().default("/"),
    }),
  },
  responses: {
    200: {
      description: "Directory contents",
      content: {
        "application/json": {
          schema: z.object({
            currentPath: z.string(),
            parentPath: z.string().nullable(),
            entries: z.array(
              z.object({
                name: z.string(),
                type: z.enum(["file", "directory"]),
                path: z.string(),
              }),
            ),
          }),
        },
      },
    },
    400: {
      description: "Invalid path",
    },
    403: {
      description: "Access denied",
    },
  },
});

filesystem.openapi(listDirectoryRoute, async (c) => {
  const { path: requestedPath } = c.req.query();

  try {
    // Resolve to absolute path and prevent directory traversal attacks
    let absolutePath = path.resolve(requestedPath);

    // Check if path exists and is a directory
    try {
      const stats = await fs.stat(absolutePath);
      if (!stats.isDirectory()) {
        // If it's not a directory, try the parent directory
        absolutePath = path.dirname(absolutePath);
        const parentStats = await fs.stat(absolutePath);
        if (!parentStats.isDirectory()) {
          // Fall back to home directory
          absolutePath = process.env.HOME || "/";
        }
      }
    } catch (_error) {
      // If path doesn't exist, try parent directories until we find one that exists
      let currentPath = absolutePath;
      let found = false;

      while (!found && currentPath !== "/") {
        currentPath = path.dirname(currentPath);
        try {
          const stats = await fs.stat(currentPath);
          if (stats.isDirectory()) {
            absolutePath = currentPath;
            found = true;
          }
        } catch {
          // Continue to parent
        }
      }

      if (!found) {
        // Fall back to home directory or root
        absolutePath = process.env.HOME || "/";
      }
    }

    // Read directory contents
    const entries = await fs.readdir(absolutePath, { withFileTypes: true });

    // Filter and map entries
    const mappedEntries = entries
      .filter((entry) => {
        // Filter out hidden files/folders (starting with .)
        if (entry.name.startsWith(".")) return false;
        // Only include directories and regular files
        return entry.isDirectory() || entry.isFile();
      })
      .map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? ("directory" as const) : ("file" as const),
        path: path.join(absolutePath, entry.name),
      }))
      .sort((a, b) => {
        // Sort directories first, then alphabetically
        if (a.type !== b.type) {
          return a.type === "directory" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

    // Get parent path
    const parentPath = absolutePath === "/" ? null : path.dirname(absolutePath);

    return c.json({
      currentPath: absolutePath,
      parentPath,
      entries: mappedEntries,
    });
  } catch (error) {
    console.error("Error listing directory:", error);
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return c.json({ error: "Path not found" }, 400);
    } else if (err.code === "EACCES") {
      return c.json({ error: "Permission denied" }, 403);
    }
    return c.json({ error: "Failed to list directory" }, 500);
  }
});

export default filesystem;
