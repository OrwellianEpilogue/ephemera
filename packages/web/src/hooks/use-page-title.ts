import { useEffect } from "react";
import { useQueue } from "./useQueue";
import { useRequestStats } from "./useRequests";
import { useAuth, usePermissions } from "./useAuth";

export function usePageTitle(title: string) {
  // Get counts for badge (these are cached from root SSE connection)
  const { data: queue } = useQueue({ enableSSE: false });
  const { data: requestStats } = useRequestStats();
  const { isAdmin } = useAuth();
  const { data: permissions } = usePermissions();

  const canManageRequests = isAdmin || permissions?.canManageRequests;

  const queuedCount = queue ? Object.keys(queue.queued).length : 0;
  const downloadingCount = queue ? Object.keys(queue.downloading).length : 0;
  const delayedCount = queue ? Object.keys(queue.delayed).length : 0;
  const totalActiveCount = queuedCount + downloadingCount + delayedCount;

  const pendingApprovalCount = requestStats?.pending_approval || 0;
  const badgeCount =
    totalActiveCount + (canManageRequests ? pendingApprovalCount : 0);

  const isPaused = queue?.paused ?? false;

  useEffect(() => {
    const baseTitle = title ? `${title} | Ephemera` : "Ephemera";
    const pausePrefix = isPaused ? "⏸︎ " : ""; // U+FE0E forces text rendering
    const countPrefix = badgeCount > 0 ? `(${badgeCount}) ` : "";
    document.title = `${pausePrefix}${countPrefix}${baseTitle}`;
  }, [title, badgeCount, isPaused]);
}
