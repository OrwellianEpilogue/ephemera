import {
  Card,
  Text,
  Progress,
  Group,
  Badge,
  Stack,
  ActionIcon,
  Tooltip,
  Image,
  Box,
  Button,
} from "@mantine/core";
import {
  IconX,
  IconRefresh,
  IconClock,
  IconCheck,
  IconAlertCircle,
} from "@tabler/icons-react";
import type { QueueItem } from "@ephemera/shared";
import { formatDate, formatTime as formatTimeOfDay } from "@ephemera/shared";
import { useCancelDownload, useRetryDownload } from "../hooks/useDownload";
import { useAppSettings } from "../hooks/useSettings";

interface DownloadItemProps {
  item: QueueItem;
}

const formatBytes = (bytes?: number): string => {
  if (!bytes) return "0 B";
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${mb.toFixed(1)} MB`;
};

const formatTime = (seconds?: number): string => {
  if (!seconds || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}m ${secs}s`;
};

const getStatusColor = (status: string): string => {
  switch (status) {
    case "available":
      return "green";
    case "downloading":
      return "blue";
    case "done":
      return "teal";
    case "queued":
      return "gray";
    case "delayed":
      return "yellow";
    case "error":
      return "red";
    case "cancelled":
      return "orange";
    default:
      return "gray";
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case "available":
    case "done":
      return <IconCheck size={16} />;
    case "downloading":
      return <IconRefresh size={16} />;
    case "delayed":
      return <IconClock size={16} />;
    case "error":
      return <IconAlertCircle size={16} />;
    default:
      return null;
  }
};

export const DownloadItem = ({ item }: DownloadItemProps) => {
  const cancelDownload = useCancelDownload();
  const retryDownload = useRetryDownload();
  const { data: settings } = useAppSettings();

  const handleCancel = () => {
    cancelDownload.mutate({ md5: item.md5, title: item.title });
  };

  const handleRetry = () => {
    retryDownload.mutate({ md5: item.md5, title: item.title });
  };

  const canCancel = ["queued", "downloading", "delayed"].includes(item.status);
  const showProgress = item.status === "downloading";

  // Use settings for date/time formatting, fall back to defaults
  const timeFormat = settings?.timeFormat ?? "24h";
  const dateFormat = settings?.dateFormat ?? "us";

  return (
    <Card withBorder padding="md">
      <Group align="flex-start" wrap="nowrap">
        {/* Cover Image */}
        <Box style={{ flexShrink: 0 }}>
          <Image
            src={
              item.coverUrl ||
              "https://placehold.co/80x120/e9ecef/495057?text=No+Cover"
            }
            width={80}
            height={120}
            fit="cover"
            radius="sm"
            fallbackSrc="https://placehold.co/80x120/e9ecef/495057?text=No+Cover"
          />
        </Box>

        {/* Content */}
        <Stack gap="xs" style={{ flex: 1 }}>
          {/* Header */}
          <Group justify="space-between" wrap="nowrap">
            <div style={{ flex: 1 }}>
              <Text fw={500} size="sm" lineClamp={2}>
                {item.title}
              </Text>
              {item.authors && item.authors.length > 0 && (
                <Text size="xs" c="dimmed" lineClamp={1}>
                  {item.authors.join(", ")}
                </Text>
              )}
            </div>
            {canCancel && (
              <Tooltip label="Cancel download">
                <ActionIcon
                  color="red"
                  variant="subtle"
                  onClick={handleCancel}
                  loading={cancelDownload.isPending}
                >
                  <IconX size={16} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>

          {/* Badges */}
          <Group gap="xs">
            <Badge
              size="sm"
              color={getStatusColor(item.status)}
              leftSection={getStatusIcon(item.status)}
            >
              {item.status.toUpperCase()}
            </Badge>

            {item.format && (
              <Badge size="sm" variant="light" color="blue">
                {item.format}
              </Badge>
            )}

            {item.year && (
              <Badge size="sm" variant="light" color="gray">
                {item.year}
              </Badge>
            )}

            {item.uploadStatus && (
              <Badge size="sm" variant="light" color="violet">
                Upload: {item.uploadStatus}
              </Badge>
            )}
          </Group>

          {/* Progress Bar (for downloading) */}
          {showProgress && (
            <Progress
              value={item.progress || 0}
              size="lg"
              animated
              color="blue"
            />
          )}

          {/* Download Info */}
          <Group gap="md" justify="space-between">
            <Text size="xs" c="dimmed">
              {item.downloadedBytes && item.totalBytes ? (
                <>
                  {formatBytes(item.downloadedBytes)} /{" "}
                  {formatBytes(item.totalBytes)}
                </>
              ) : item.totalBytes ? (
                formatBytes(item.totalBytes)
              ) : item.size ? (
                formatBytes(item.size)
              ) : (
                "Size unknown"
              )}
            </Text>

            {showProgress && item.speed && (
              <Text size="xs" c="dimmed">
                {item.speed}
              </Text>
            )}

            {showProgress && item.eta && (
              <Text size="xs" c="dimmed">
                ETA: {formatTime(item.eta)}
              </Text>
            )}
          </Group>

          {/* Retry Info (for delayed items) */}
          {item.status === "delayed" && item.nextRetryAt && (
            <Group gap="xs">
              <IconClock size={14} />
              <Text size="xs" c="dimmed">
                Next retry: {formatTimeOfDay(item.nextRetryAt, timeFormat)}
              </Text>
              {item.downloadsLeft !== undefined && (
                <Text size="xs" c="dimmed">
                  ({item.downloadsLeft} downloads left today)
                </Text>
              )}
            </Group>
          )}

          {/* Error Message */}
          {item.status === "error" && (
            <Stack gap="xs">
              {item.error && (
                <Text size="xs" c="red" lineClamp={2}>
                  Error: {item.error}
                </Text>
              )}
              <div>
                <Button
                  size="xs"
                  variant="light"
                  color="blue"
                  leftSection={<IconRefresh size={14} />}
                  onClick={handleRetry}
                  loading={retryDownload.isPending}
                >
                  Retry Download
                </Button>
              </div>
            </Stack>
          )}

          {/* Timestamps */}
          <Group gap="md" justify="space-between">
            <Text size="xs" c="dimmed">
              Queued: {formatDate(item.queuedAt, dateFormat, timeFormat)}
            </Text>
            {item.completedAt && (
              <Text size="xs" c="dimmed">
                Completed:{" "}
                {formatDate(item.completedAt, dateFormat, timeFormat)}
              </Text>
            )}
          </Group>
        </Stack>
      </Group>
    </Card>
  );
};
