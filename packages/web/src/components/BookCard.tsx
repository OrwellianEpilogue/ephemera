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

interface BookCardProps {
  book: Book;
}

const formatFileSize = (bytes?: number): string => {
  if (!bytes) return "Unknown";
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${mb.toFixed(1)} MB`;
};

const getDownloadStatusBadge = (
  status: string | null | undefined,
  progress?: number,
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
      return (
        <Badge
          size="sm"
          variant="light"
          color="cyan"
          leftSection={<IconDownload size={12} />}
        >
          Downloading {progress !== undefined ? `${progress}%` : ""}
        </Badge>
      );
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
          {getDownloadStatusBadge(status, progress)}
        </Group>

        {book.year && (
          <Text size="xs" c="dimmed">
            {book.year}
          </Text>
        )}

        {book.language && (
          <Text size="xs" c="dimmed">
            Language: {book.language.toUpperCase()}
          </Text>
        )}

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
              ? `Downloading ${progress !== undefined ? `${progress}%` : "..."}`
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
