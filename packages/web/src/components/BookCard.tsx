import {
  Card,
  Image,
  Text,
  Badge,
  Button,
  Group,
  Stack,
  AspectRatio,
} from "@mantine/core";
import {
  IconDownload,
  IconCheck,
  IconClock,
  IconAlertCircle,
} from "@tabler/icons-react";
import type { Book } from "@ephemera/shared";
import { useQueueDownload } from "../hooks/useDownload";
import { useBookStatus } from "../hooks/useBookStatus";
import { memo } from "react";

interface BookCardProps {
  book: Book;
}

interface LiveCountdownBadgeProps {
  md5: string;
  status: string | null | undefined;
  progress?: number;
}

// Separate component for the live countdown badge that re-renders every second
const LiveCountdownBadge = memo(
  ({ md5, status, progress }: LiveCountdownBadgeProps) => {
    const { remainingCountdown } = useBookStatus(md5);

    if (
      status === "queued" &&
      remainingCountdown !== null &&
      remainingCountdown !== undefined
    ) {
      return (
        <Badge
          size="sm"
          variant="light"
          color="blue"
          leftSection={<IconClock size={12} />}
        >
          {`Waiting ${remainingCountdown}s...`}
        </Badge>
      );
    }

    if (status === "downloading" && progress !== undefined) {
      return (
        <Badge
          size="sm"
          variant="light"
          color="cyan"
          leftSection={<IconDownload size={12} />}
        >
          {`Downloading ${Math.round(progress)}%`}
        </Badge>
      );
    }

    return null;
  },
);

const formatFileSize = (bytes?: number): string => {
  if (!bytes) return "Unknown";
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${mb.toFixed(1)} MB`;
};

const getDownloadStatusBadge = (
  status: string | null | undefined,
  _progress?: number,
  _remainingCountdown?: number | null,
) => {
  if (!status) return null;

  switch (status) {
    case "available":
      return (
        <Badge
          size="sm"
          variant="light"
          color="green"
          leftSection={<IconCheck size={12} />}
        >
          Downloaded
        </Badge>
      );
    case "queued":
      return (
        <Badge
          size="sm"
          variant="light"
          color="blue"
          leftSection={<IconClock size={12} />}
        >
          Queued
        </Badge>
      );
    case "downloading":
      // Handled separately by LiveCountdownBadge to avoid re-rendering entire card
      return null;
    case "delayed":
      return (
        <Badge
          size="sm"
          variant="light"
          color="orange"
          leftSection={<IconClock size={12} />}
        >
          Delayed
        </Badge>
      );
    case "error":
      return (
        <Badge
          size="sm"
          variant="light"
          color="red"
          leftSection={<IconAlertCircle size={12} />}
        >
          Error
        </Badge>
      );
    default:
      return null;
  }
};

export const BookCard = ({ book }: BookCardProps) => {
  const queueDownload = useQueueDownload();

  // Get live status from queue (reactive to SSE updates)
  const {
    status,
    progress,
    isAvailable,
    isQueued,
    isDownloading,
    isDelayed,
    isError,
    remainingCountdown,
  } = useBookStatus(book.md5, book.downloadStatus);

  const handleDownload = () => {
    queueDownload.mutate({
      md5: book.md5,
      title: book.title,
    });
  };

  const isInQueue = isQueued || isDownloading || isDelayed;

  return (
    <Card
      shadow="sm"
      padding="lg"
      radius="md"
      withBorder
      h="100%"
      style={{ display: "flex", flexDirection: "column" }}
    >
      <Card.Section>
        <AspectRatio ratio={2 / 3}>
          {book.coverUrl ? (
            <Image
              src={book.coverUrl}
              alt={book.title}
              fallbackSrc="https://placehold.co/400x600/e9ecef/495057?text=No+Cover"
              loading="lazy"
            />
          ) : (
            <Image
              src="https://placehold.co/400x600/e9ecef/495057?text=No+Cover"
              alt="No cover"
              loading="lazy"
            />
          )}
        </AspectRatio>
      </Card.Section>

      <Stack
        gap="xs"
        mt="md"
        style={{ flex: 1, display: "flex", flexDirection: "column" }}
      >
        <Text fw={500} lineClamp={2} size="sm">
          {book.title}
        </Text>

        {book.authors && book.authors.length > 0 && (
          <Text size="xs" c="dimmed" lineClamp={1}>
            {book.authors.join(", ")}
          </Text>
        )}

        <Group gap="xs">
          {book.format && (
            <Badge size="sm" variant="light" color="blue">
              {book.format}
            </Badge>
          )}
          {book.size && (
            <Badge size="sm" variant="light" color="gray">
              {formatFileSize(book.size)}
            </Badge>
          )}
          {book.year && (
            <Badge size="sm" variant="light" color="gray">
              {book.year}
            </Badge>
          )}
          {book.language && (
            <Badge size="sm" variant="light" color="teal">
              {book.language.toUpperCase()}
            </Badge>
          )}
          {status === "queued" || status === "downloading" ? (
            <LiveCountdownBadge
              md5={book.md5}
              status={status}
              progress={progress}
            />
          ) : (
            getDownloadStatusBadge(status, progress, remainingCountdown)
          )}
        </Group>

        <Button
          fullWidth
          mt="auto"
          leftSection={<IconDownload size={16} />}
          onClick={handleDownload}
          loading={queueDownload.isPending}
          disabled={queueDownload.isPending || isAvailable || isInQueue}
          variant={isAvailable ? "light" : isError ? "outline" : "filled"}
          color={isAvailable ? "green" : isError ? "red" : undefined}
        >
          {isAvailable
            ? "Already Downloaded"
            : isDownloading
              ? `Downloading ${progress !== undefined ? `${Math.round(progress)}%` : "..."}`
              : isQueued
                ? "In Queue"
                : isDelayed
                  ? "Delayed"
                  : isError
                    ? "Retry Download"
                    : "Download"}
        </Button>
      </Stack>
    </Card>
  );
};
