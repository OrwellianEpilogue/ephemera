import {
  Card,
  Image,
  Text,
  Badge,
  Button,
  Group,
  Stack,
  AspectRatio,
  Tooltip,
  ActionIcon,
  Menu,
} from "@mantine/core";
import {
  IconDownload,
  IconCheck,
  IconClock,
  IconAlertCircle,
  IconBookmark,
  IconMail,
  IconCloudUpload,
} from "@tabler/icons-react";
import type { Book } from "@ephemera/shared";
import { useQueueDownload, useDownloadFile } from "../hooks/useDownload";
import { useCreateRequest, usePendingRequestMd5s } from "../hooks/useRequests";
import { useBookStatus } from "../hooks/useBookStatus";
import { useAuth, usePermissions } from "../hooks/useAuth";
import { useFrontendConfig } from "../hooks/useConfig";
import { useEmailRecipients, useSendBookEmail } from "../hooks/useEmail";
import {
  useTolinoSettings,
  useTolinoUpload,
  useTolinoSuggestedCollection,
} from "../hooks/useTolino";
import { useCalibreStatus } from "../hooks/useCalibre";
import { TolinoUploadDialog } from "./TolinoUploadDialog";
import { memo, useState } from "react";

// Tolino Cloud accepts EPUB and PDF directly
const TOLINO_NATIVE_FORMATS = ["epub", "pdf"];

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

// Memoize BookCard to prevent re-renders when parent changes but book prop is stable
export const BookCard = memo(function BookCard({ book }: BookCardProps) {
  const queueDownload = useQueueDownload();
  const downloadFile = useDownloadFile();
  const createRequest = useCreateRequest();
  const { isAdmin, user } = useAuth();
  const { data: permissions } = usePermissions();
  const { data: config } = useFrontendConfig();
  const { data: emailRecipients } = useEmailRecipients();
  const sendEmail = useSendBookEmail();
  const { data: tolinoSettings } = useTolinoSettings();
  const { data: calibreStatus } = useCalibreStatus();
  const tolinoUpload = useTolinoUpload();
  const pendingRequestMd5s = usePendingRequestMd5s();

  const [tolinoDialogOpened, setTolinoDialogOpened] = useState(false);

  // Check if user can start downloads directly
  const canStartDownloads = isAdmin || permissions?.canStartDownloads !== false;

  // Check if this book is already requested (pending approval or active)
  const isAlreadyRequested = pendingRequestMd5s.has(book.md5);

  // Tolino format checks
  const bookFormat = (book.format || "").toLowerCase();
  const isNativeFormat = TOLINO_NATIVE_FORMATS.includes(bookFormat);
  const canConvertToEpub = !isNativeFormat && calibreStatus?.available;
  const canUploadToTolino = isNativeFormat || canConvertToEpub;
  const needsConversion = !isNativeFormat && canConvertToEpub;

  // File access requires keepInDownloads to be enabled
  const keepInDownloads = config?.keepInDownloads ?? false;
  const fileAccessDisabled = !keepInDownloads;
  const fileAccessTooltip = fileAccessDisabled
    ? 'Enable "Keep copy in downloads folder" in Settings to use browser downloads and email'
    : undefined;

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

  // Fetch suggested collection when dialog is open
  const { data: suggestedCollectionData } = useTolinoSuggestedCollection(
    book.md5,
    tolinoDialogOpened,
  );

  const handleDownload = () => {
    queueDownload.mutate({
      md5: book.md5,
      title: book.title,
    });
  };

  const handleRequest = () => {
    // Create a request with the book's title, author, and MD5 for direct download when approved
    createRequest.mutate({
      title: book.title,
      author: book.authors?.[0],
      ext: book.format ? [book.format] : undefined,
      lang: book.language ? [book.language] : undefined,
      targetBookMd5: book.md5,
    });
  };

  const handleFileDownload = () => {
    downloadFile.mutate({
      md5: book.md5,
      title: book.title,
      format: book.format,
      authors: book.authors,
      year: book.year,
      language: book.language,
    });
  };

  const handleTolinoUploadClick = () => {
    if (tolinoSettings?.askCollectionOnUpload) {
      setTolinoDialogOpened(true);
    } else {
      tolinoUpload.mutate({ md5: book.md5 });
    }
  };

  const handleTolinoUploadWithCollection = (collection?: string) => {
    tolinoUpload.mutate(
      { md5: book.md5, collection },
      {
        onSuccess: () => {
          setTolinoDialogOpened(false);
        },
      },
    );
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
            // Don't show "Downloaded" badge here - it's shown with action buttons below
            status !== "available" &&
            getDownloadStatusBadge(status, progress, remainingCountdown)
          )}
        </Group>

        {isAvailable ? (
          // Downloaded state: show "Downloaded" badge with action buttons
          <Group mt="auto" gap="xs" justify="space-between" wrap="nowrap">
            <Badge
              size="lg"
              variant="light"
              color="green"
              leftSection={<IconCheck size={14} />}
            >
              Downloaded
            </Badge>
            <Group gap={4} wrap="nowrap">
              {/* Download file button */}
              <Tooltip
                label={fileAccessTooltip || "Download file"}
                color={fileAccessDisabled ? "orange" : undefined}
              >
                <ActionIcon
                  color={fileAccessDisabled ? "gray" : "green"}
                  variant="subtle"
                  onClick={handleFileDownload}
                  loading={downloadFile.isPending}
                  disabled={fileAccessDisabled}
                  size="sm"
                >
                  <IconDownload size={16} />
                </ActionIcon>
              </Tooltip>

              {/* Email button */}
              {config?.emailEnabled &&
                emailRecipients &&
                emailRecipients.length > 0 &&
                (fileAccessDisabled ? (
                  <Tooltip label={fileAccessTooltip} color="orange">
                    <ActionIcon
                      color="gray"
                      variant="subtle"
                      disabled
                      size="sm"
                    >
                      <IconMail size={16} />
                    </ActionIcon>
                  </Tooltip>
                ) : emailRecipients.length === 1 && emailRecipients[0] ? (
                  <Tooltip
                    label={`Send to ${emailRecipients[0].name || emailRecipients[0].email}`}
                  >
                    <ActionIcon
                      color="blue"
                      variant="subtle"
                      loading={sendEmail.isPending}
                      onClick={() =>
                        sendEmail.mutate({
                          recipientId: emailRecipients[0]!.id,
                          md5: book.md5,
                        })
                      }
                      size="sm"
                    >
                      <IconMail size={16} />
                    </ActionIcon>
                  </Tooltip>
                ) : (
                  <Menu shadow="md" width={250}>
                    <Menu.Target>
                      <Tooltip label="Send via email">
                        <ActionIcon
                          color="blue"
                          variant="subtle"
                          loading={sendEmail.isPending}
                          size="sm"
                        >
                          <IconMail size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Label>Send to:</Menu.Label>
                      {isAdmin ? (
                        <>
                          {emailRecipients
                            .filter((r) => r.userId === user?.id)
                            .map((recipient) => (
                              <Menu.Item
                                key={recipient.id}
                                onClick={() =>
                                  sendEmail.mutate({
                                    recipientId: recipient.id,
                                    md5: book.md5,
                                  })
                                }
                              >
                                {recipient.name || recipient.email}
                              </Menu.Item>
                            ))}
                          {emailRecipients.some((r) => r.userId !== user?.id) &&
                            emailRecipients.some(
                              (r) => r.userId === user?.id,
                            ) && <Menu.Divider />}
                          {emailRecipients
                            .filter((r) => r.userId !== user?.id)
                            .map((recipient) => (
                              <Menu.Item
                                key={recipient.id}
                                onClick={() =>
                                  sendEmail.mutate({
                                    recipientId: recipient.id,
                                    md5: book.md5,
                                  })
                                }
                              >
                                {recipient.name || recipient.email}
                                {recipient.userName && (
                                  <Text span size="xs" c="dimmed" ml={4}>
                                    ({recipient.userName})
                                  </Text>
                                )}
                              </Menu.Item>
                            ))}
                        </>
                      ) : (
                        emailRecipients.map((recipient) => (
                          <Menu.Item
                            key={recipient.id}
                            onClick={() =>
                              sendEmail.mutate({
                                recipientId: recipient.id,
                                md5: book.md5,
                              })
                            }
                          >
                            {recipient.name || recipient.email}
                          </Menu.Item>
                        ))
                      )}
                    </Menu.Dropdown>
                  </Menu>
                ))}

              {/* Tolino Cloud upload button */}
              {permissions?.canConfigureTolino &&
                tolinoSettings?.configured &&
                canUploadToTolino && (
                  <Tooltip
                    label={
                      fileAccessDisabled
                        ? fileAccessTooltip
                        : needsConversion
                          ? "Upload to Tolino Cloud (will convert to EPUB)"
                          : "Upload to Tolino Cloud"
                    }
                    color={fileAccessDisabled ? "orange" : undefined}
                  >
                    <ActionIcon
                      color={fileAccessDisabled ? "gray" : "cyan"}
                      variant="subtle"
                      onClick={handleTolinoUploadClick}
                      loading={tolinoUpload.isPending}
                      disabled={fileAccessDisabled}
                      size="sm"
                    >
                      <IconCloudUpload size={16} />
                    </ActionIcon>
                  </Tooltip>
                )}
            </Group>
          </Group>
        ) : canStartDownloads ? (
          <Button
            fullWidth
            mt="auto"
            leftSection={<IconDownload size={16} />}
            onClick={handleDownload}
            loading={queueDownload.isPending}
            disabled={queueDownload.isPending || isInQueue}
            variant={isError ? "outline" : "filled"}
            color={isError ? "red" : undefined}
          >
            {isDownloading
              ? `Downloading ${progress !== undefined ? `${Math.round(progress)}%` : "..."}`
              : isQueued
                ? "In Queue"
                : isDelayed
                  ? "Delayed"
                  : isError
                    ? "Retry Download"
                    : "Download"}
          </Button>
        ) : (
          <Tooltip
            label={
              isAlreadyRequested
                ? "You have already requested this book"
                : "Your request will be reviewed by an administrator"
            }
            multiline
            w={200}
          >
            <Button
              fullWidth
              mt="auto"
              leftSection={<IconBookmark size={16} />}
              onClick={handleRequest}
              loading={createRequest.isPending}
              disabled={
                createRequest.isPending || isInQueue || isAlreadyRequested
              }
              variant={isAlreadyRequested ? "light" : "filled"}
              color={isAlreadyRequested ? "yellow" : "orange"}
            >
              {isInQueue
                ? "In Queue"
                : isAlreadyRequested
                  ? "Already Requested"
                  : "Request"}
            </Button>
          </Tooltip>
        )}
      </Stack>

      {/* Tolino Upload Dialog */}
      <TolinoUploadDialog
        opened={tolinoDialogOpened}
        onClose={() => setTolinoDialogOpened(false)}
        onUpload={handleTolinoUploadWithCollection}
        isUploading={tolinoUpload.isPending}
        bookTitle={book.title}
        needsConversion={needsConversion}
        suggestedCollection={suggestedCollectionData?.suggestedCollection}
      />
    </Card>
  );
});
