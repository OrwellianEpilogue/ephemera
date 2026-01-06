import { createFileRoute, Link } from "@tanstack/react-router";
import { requireAuth } from "../lib/route-auth";
import { usePageTitle } from "../hooks/use-page-title";
import {
  Container,
  Title,
  Tabs,
  Stack,
  Center,
  Loader,
  Text,
  Badge,
  Group,
  Card,
  ActionIcon,
  Tooltip,
  Anchor,
  Button,
  Modal,
  Textarea,
  Image,
  Box,
  TextInput,
} from "@mantine/core";
import {
  IconBookmark,
  IconClock,
  IconCheck,
  IconTrash,
  IconRefresh,
  IconX,
  IconHourglass,
  IconExternalLink,
  IconBook,
  IconStar,
  IconSearch,
} from "@tabler/icons-react";
import { useState, useMemo, useCallback } from "react";
import { useDisclosure } from "@mantine/hooks";
import {
  useRequests,
  useRequestStats,
  useDeleteRequest,
  useApproveRequest,
  useRejectRequest,
} from "../hooks/useRequests";
import { useAppSettings } from "../hooks/useSettings";
import { useAuth, usePermissions } from "../hooks/useAuth";
import { UserBadge } from "../components/UserBadge";
import { SOURCE_COLORS, type SavedRequestWithMetadata } from "@ephemera/shared";
import { useTranslation } from "react-i18next";
import { formatDistanceToNowLocalized } from "../utils/date-utils";

// Helper to get cover URL (local or remote)
function getCoverUrl(
  metadata: SavedRequestWithMetadata["metadata"],
): string | null {
  if (!metadata) return null;
  // Prefer local cover path, fall back to remote URL
  if (metadata.coverPath) {
    // Extract filename from path for API route
    const filename = metadata.coverPath.split("/").pop();
    return `/api/covers/${filename}`;
  }
  return metadata.coverUrl || null;
}

// Request card component
function RequestCard({ request }: { request: SavedRequestWithMetadata }) {
  const { t, i18n } = useTranslation("translation", {
    keyPrefix: "requests",
  });
  const deleteRequest = useDeleteRequest();
  const approveRequest = useApproveRequest();
  const rejectRequest = useRejectRequest();
  const { isAdmin } = useAuth();
  const { data: permissions } = usePermissions();
  const [
    rejectModalOpened,
    { open: openRejectModal, close: closeRejectModal },
  ] = useDisclosure(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const handleDelete = () => {
    if (confirm(t("card.confirm_delete"))) {
      deleteRequest.mutate(request.id);
    }
  };

  const handleApprove = () => {
    approveRequest.mutate(request.id);
  };

  const handleReject = () => {
    rejectRequest.mutate({
      id: request.id,
      reason: rejectionReason || undefined,
    });
    setRejectionReason("");
    closeRejectModal();
  };

  // Parse query params for display
  const params = request.queryParams || {};
  const filters = [];

  // Helper to normalize string | string[] to string[]
  const toArray = (val: string | string[] | undefined): string[] => {
    if (!val) return [];
    return Array.isArray(val) ? val : [val];
  };

  if (params.author) {
    filters.push(t("filters.author", { value: params.author }));
  }

  if (params.title) {
    filters.push(t("filters.title", { value: params.title }));
  }

  const extArray = toArray(params.ext);
  if (extArray.length > 0) {
    filters.push(t("filters.format", { value: extArray.join(", ") }));
  }

  const langArray = toArray(params.lang);
  if (langArray.length > 0) {
    filters.push(t("filters.language", { value: langArray.join(", ") }));
  }

  const contentArray = toArray(params.content);
  if (contentArray.length > 0) {
    filters.push(t("filters.content", { value: contentArray.join(", ") }));
  }

  if (params.sort) {
    filters.push(t("filters.sort", { value: params.sort }));
  }

  const statusColor =
    {
      pending_approval: "orange",
      active: "blue",
      fulfilled: "green",
      cancelled: "gray",
      rejected: "red",
    }[request.status as string] || "gray";

  const statusLabel = t(`status.${request.status}`, {
    defaultValue: request.status,
  });

  // Check if user has permission to manage requests
  const hasManagePermission = isAdmin || permissions?.canManageRequests;

  const getDisplayTitle = () => {
    if (params.q) return params.q;

    if (params.title && params.author) {
      return t("card.title_author", {
        title: params.title,
        author: params.author,
      });
    }
    if (params.title) return t("card.title_only", { title: params.title });
    if (params.author) return t("card.author_only", { author: params.author });

    return t("card.unknown_search");
  };

  const metadata = request.metadata;
  const coverUrl = getCoverUrl(metadata);

  return (
    <Card withBorder padding="md">
      <Group align="flex-start" wrap="nowrap" gap="md">
        {/* Cover image */}
        {coverUrl && (
          <Box style={{ flexShrink: 0 }}>
            <Image
              src={coverUrl}
              alt={metadata?.title || "Book cover"}
              w={75}
              h={112}
              radius="sm"
              fallbackSrc="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='75' height='112' viewBox='0 0 75 112'%3E%3Crect fill='%23e0e0e0' width='75' height='112'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23999' font-size='10'%3ENo Cover%3C/text%3E%3C/svg%3E"
            />
          </Box>
        )}

        <Stack gap="sm" style={{ flex: 1, minWidth: 0 }}>
          {/* Status chips - reused in both layouts */}
          {(() => {
            const statusChips = (
              <Group
                gap="xs"
                wrap="nowrap"
                style={{ flexShrink: 0, alignItems: "center" }}
              >
                {isAdmin && request.userId && (
                  <UserBadge
                    userId={request.userId}
                    userName={request.userName}
                    size="sm"
                  />
                )}
                {request.status === "fulfilled" && request.fulfilledBookMd5 ? (
                  <Badge
                    component={Link}
                    to={`/queue#${request.fulfilledBookMd5}`}
                    color={statusColor}
                    size="sm"
                    style={{ cursor: "pointer" }}
                  >
                    {statusLabel}
                  </Badge>
                ) : (
                  <Badge color={statusColor} size="sm">
                    {statusLabel}
                  </Badge>
                )}
                {hasManagePermission && (
                  <Tooltip label={t("card.actions.delete")}>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size="sm"
                      onClick={handleDelete}
                      loading={deleteRequest.isPending}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Tooltip>
                )}
              </Group>
            );

            const hasMetadata =
              metadata &&
              (metadata.seriesName ||
                metadata.publishedYear ||
                metadata.pages ||
                metadata.isbn ||
                metadata.rating ||
                metadata.sourceUrl);

            if (hasMetadata) {
              return (
                <>
                  {/* Top row: metadata badges on left, status chips on right */}
                  <Group
                    justify="space-between"
                    wrap="nowrap"
                    align="center"
                    style={{ marginBottom: -4 }}
                  >
                    <Group gap={4} style={{ minWidth: 0 }}>
                      {metadata.sourceUrl && metadata.source && (
                        <Badge
                          component="a"
                          href={metadata.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          size="xs"
                          rightSection={<IconExternalLink size={10} />}
                          style={{
                            cursor: "pointer",
                            backgroundColor:
                              SOURCE_COLORS[metadata.source]?.bg || "#868e96",
                            color:
                              SOURCE_COLORS[metadata.source]?.text || "#fff",
                          }}
                        >
                          {metadata.source}
                        </Badge>
                      )}
                      {metadata.seriesName && (
                        <Badge
                          size="xs"
                          variant="light"
                          color="violet"
                          leftSection={<IconBook size={10} />}
                        >
                          {metadata.seriesName}
                          {metadata.seriesPosition != null &&
                            ` #${metadata.seriesPosition}`}
                        </Badge>
                      )}
                      {metadata.publishedYear && (
                        <Badge size="xs" variant="light" color="gray">
                          {metadata.publishedYear}
                        </Badge>
                      )}
                      {metadata.pages && (
                        <Badge size="xs" variant="light" color="gray">
                          {t("card.metadata.pages", {
                            count: metadata.pages,
                          })}
                        </Badge>
                      )}
                      {metadata.isbn && (
                        <Badge size="xs" variant="light" color="gray">
                          {metadata.isbn}
                        </Badge>
                      )}
                      {metadata.rating && (
                        <Badge
                          size="xs"
                          variant="light"
                          color="yellow"
                          leftSection={<IconStar size={10} />}
                        >
                          {metadata.rating.toFixed(1)}
                        </Badge>
                      )}
                    </Group>
                    {statusChips}
                  </Group>

                  {/* Title */}
                  <Text fw={500} style={{ wordBreak: "break-word" }}>
                    {getDisplayTitle()}
                  </Text>
                </>
              );
            }

            // No metadata: title with status chips on same row
            return (
              <Group justify="space-between" wrap="nowrap" align="center">
                <Text fw={500} style={{ wordBreak: "break-word", minWidth: 0 }}>
                  {getDisplayTitle()}
                </Text>
                {statusChips}
              </Group>
            );
          })()}

          {filters.length > 0 && (
            <Group gap={4}>
              {filters.map((filter, idx) => (
                <Badge key={idx} size="xs" variant="light" color="gray">
                  {filter}
                </Badge>
              ))}
            </Group>
          )}

          <Group
            gap="md"
            style={{
              fontSize: "0.85rem",
              color: "var(--mantine-color-dimmed)",
            }}
          >
            <Group gap={4}>
              <IconClock size={14} />
              <Text size="xs">
                {t("card.metadata.created", {
                  time: formatDistanceToNowLocalized(
                    new Date(request.createdAt),
                    i18n.language,
                  ),
                })}
              </Text>
            </Group>

            {request.lastCheckedAt && (
              <Group gap={4}>
                <IconRefresh size={14} />
                <Text size="xs">
                  {t("card.metadata.last_checked", {
                    time: formatDistanceToNowLocalized(
                      new Date(request.lastCheckedAt),
                      i18n.language,
                    ),
                  })}
                </Text>
              </Group>
            )}

            {request.fulfilledAt && (
              <Group gap={4}>
                <IconCheck size={14} />
                <Text size="xs">
                  {t("card.metadata.fulfilled", {
                    time: formatDistanceToNowLocalized(
                      new Date(request.fulfilledAt),
                      i18n.language,
                    ),
                  })}
                </Text>
              </Group>
            )}
          </Group>

          {/* Show rejection reason for rejected requests */}
          {request.status === "rejected" && (
            <Card withBorder bg="var(--mantine-color-red-light)">
              <Stack gap={4}>
                <Text size="sm" fw={500} c="red">
                  {t("card.rejection.title")}
                </Text>
                {request.rejectionReason && (
                  <Text size="xs">
                    {t("card.rejection.reason", {
                      reason: request.rejectionReason,
                    })}
                  </Text>
                )}
                {request.approverName && (
                  <Text size="xs" c="dimmed">
                    {t("card.rejection.by", {
                      name: request.approverName,
                    })}
                    {request.rejectedAt &&
                      ` ${formatDistanceToNowLocalized(new Date(request.rejectedAt), i18n.language)}`}
                  </Text>
                )}
              </Stack>
            </Card>
          )}

          {/* Show approver info for approved requests */}
          {request.status === "active" && request.approverName && (
            <Text size="xs" c="dimmed">
              {t("card.approval.by", {
                name: request.approverName,
              })}
              {request.approvedAt &&
                ` ${formatDistanceToNowLocalized(new Date(request.approvedAt), i18n.language)}`}
            </Text>
          )}

          {/* Approve/Reject buttons for pending requests */}
          {request.status === "pending_approval" && hasManagePermission && (
            <Group gap="xs">
              <Button
                size="xs"
                color="green"
                leftSection={<IconCheck size={14} />}
                onClick={handleApprove}
                loading={approveRequest.isPending}
              >
                {t("card.actions.approve")}
              </Button>
              <Button
                size="xs"
                color="red"
                variant="light"
                leftSection={<IconX size={14} />}
                onClick={openRejectModal}
              >
                {t("card.actions.reject")}
              </Button>
            </Group>
          )}
        </Stack>
      </Group>

      {/* Rejection modal */}
      <Modal
        opened={rejectModalOpened}
        onClose={closeRejectModal}
        title={t("modals.reject.title")}
        centered
      >
        <Stack gap="md">
          <Text size="sm">{t("modals.reject.confirmation")}</Text>
          <Textarea
            label={t("modals.reject.reason_label")}
            placeholder={t("modals.reject.reason_placeholder")}
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.currentTarget.value)}
          />
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={closeRejectModal}>
              {t("common:actions.cancel")}
            </Button>
            <Button
              color="red"
              onClick={handleReject}
              loading={rejectRequest.isPending}
            >
              {t("modals.reject.confirm")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
}

// Main Requests page
function RequestsPage() {
  const { t } = useTranslation("translation", {
    keyPrefix: "requests",
  });
  usePageTitle(t("title"));
  const [activeTab, setActiveTab] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const { isAdmin } = useAuth();
  const { data: permissions } = usePermissions();
  const canManageRequests = isAdmin || permissions?.canManageRequests;

  // Helper function to format check interval for display
  function formatCheckInterval(interval: string): string {
    return t(`intervals.${interval}`, {
      defaultValue: t("intervals.6h"),
    });
  }

  // Fetch requests based on active tab
  const statusFilter =
    activeTab === "all"
      ? undefined
      : (activeTab as
          | "pending_approval"
          | "active"
          | "fulfilled"
          | "cancelled"
          | "rejected");
  const { data: requests, isLoading, isError } = useRequests(statusFilter);
  const { data: stats } = useRequestStats();
  const { data: settings } = useAppSettings();

  // Filter requests by search query
  const filterRequests = useCallback(
    (items: SavedRequestWithMetadata[]) => {
      if (!searchQuery.trim()) return items;
      const query = searchQuery.toLowerCase();
      return items.filter((item) => {
        const params = item.queryParams || {};
        const metadata = item.metadata;

        // Search in query params
        const matchesParams =
          params.q?.toLowerCase().includes(query) ||
          params.title?.toLowerCase().includes(query) ||
          params.author?.toLowerCase().includes(query);

        // Search in metadata
        const matchesMetadata =
          metadata?.title?.toLowerCase().includes(query) ||
          metadata?.author?.toLowerCase().includes(query) ||
          metadata?.isbn?.toLowerCase().includes(query) ||
          metadata?.seriesName?.toLowerCase().includes(query) ||
          metadata?.publishedYear?.toString().includes(query) ||
          metadata?.description?.toLowerCase().includes(query);

        // Search in MD5 (target or fulfilled)
        const matchesMd5 =
          item.targetBookMd5?.toLowerCase().includes(query) ||
          item.fulfilledBookMd5?.toLowerCase().includes(query);

        // Search in user name (for admins)
        const matchesUser = item.userName?.toLowerCase().includes(query);

        return matchesParams || matchesMetadata || matchesMd5 || matchesUser;
      });
    },
    [searchQuery],
  );

  const filteredRequests = useMemo(
    () => filterRequests(requests || []),
    [requests, filterRequests],
  );

  if (isLoading) {
    return (
      <Container size="xl">
        <Center p="xl">
          <Loader size="lg" />
        </Center>
      </Container>
    );
  }

  if (isError) {
    return (
      <Container size="xl">
        <Center p="xl">
          <Text c="red">{t("errors.loading")}</Text>
        </Center>
      </Container>
    );
  }

  const tabColors: Record<string, string> = {
    all: "grape",
    pending_approval: "orange",
    active: "blue",
    fulfilled: "green",
    cancelled: "gray",
    rejected: "red",
  };

  return (
    <Container size="xl">
      <Stack gap="lg">
        <Group justify="space-between">
          <Title order={1}>{t("header.title")}</Title>
          {stats && (
            <Group gap="xs">
              {canManageRequests && stats.pending_approval > 0 && (
                <Badge color="orange" variant="light">
                  {t("stats.pending", {
                    count: stats.pending_approval,
                  })}
                </Badge>
              )}
              <Badge color="blue" variant="light">
                {t("stats.active", { count: stats.active })}
              </Badge>
              <Badge color="green" variant="light">
                {t("stats.fulfilled", {
                  count: stats.fulfilled,
                })}
              </Badge>
            </Group>
          )}
        </Group>

        <Text c="dimmed" size="sm">
          {t("header.description", {
            interval: settings?.requestCheckInterval
              ? formatCheckInterval(settings.requestCheckInterval)
              : "",
          })}{" "}
          <Anchor component={Link} to="/settings" size="sm">
            {t("header.settings_link")}
          </Anchor>
        </Text>

        <TextInput
          placeholder={t("search.placeholder")}
          leftSection={<IconSearch size={16} />}
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.currentTarget.value)}
          size="md"
        />

        <Tabs
          value={activeTab}
          onChange={(value) => setActiveTab(value || "all")}
        >
          <Tabs.List>
            <Tabs.Tab
              value="all"
              leftSection={<IconBookmark size={16} />}
              rightSection={
                stats?.total ? (
                  <Badge
                    size="sm"
                    circle={stats.total < 10}
                    color={tabColors.all}
                  >
                    {stats.total}
                  </Badge>
                ) : null
              }
            >
              {t("tabs.all")}
            </Tabs.Tab>
            <Tabs.Tab
              value="active"
              leftSection={<IconClock size={16} />}
              rightSection={
                stats?.active ? (
                  <Badge
                    size="sm"
                    circle={stats.active < 10}
                    color={tabColors.active}
                  >
                    {stats.active}
                  </Badge>
                ) : null
              }
            >
              {t("tabs.active")}
            </Tabs.Tab>
            <Tabs.Tab
              value="fulfilled"
              leftSection={<IconCheck size={16} />}
              rightSection={
                stats?.fulfilled ? (
                  <Badge
                    size="sm"
                    circle={stats.fulfilled < 10}
                    color={tabColors.fulfilled}
                  >
                    {stats.fulfilled}
                  </Badge>
                ) : null
              }
            >
              {t("tabs.fulfilled")}
            </Tabs.Tab>
            {canManageRequests && (
              <Tabs.Tab
                value="pending_approval"
                leftSection={<IconHourglass size={16} />}
                rightSection={
                  stats?.pending_approval ? (
                    <Badge
                      size="sm"
                      circle={stats.pending_approval < 10}
                      color={tabColors.pending_approval}
                    >
                      {stats.pending_approval}
                    </Badge>
                  ) : null
                }
              >
                {t("tabs.pending_approval")}
              </Tabs.Tab>
            )}
            <Tabs.Tab
              value="rejected"
              leftSection={<IconX size={16} />}
              rightSection={
                stats?.rejected ? (
                  <Badge
                    size="sm"
                    circle={stats.rejected < 10}
                    color={tabColors.rejected}
                  >
                    {stats.rejected}
                  </Badge>
                ) : null
              }
            >
              {t("tabs.rejected")}
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value={activeTab} pt="md">
            {filteredRequests.length > 0 ? (
              <Stack gap="md">
                {filteredRequests.map((request) => (
                  <RequestCard key={request.id} request={request} />
                ))}
              </Stack>
            ) : (
              <Center p="xl">
                <Stack align="center" gap="sm">
                  <IconBookmark size={48} opacity={0.3} />
                  <Text c="dimmed">
                    {searchQuery ? t("empty.no_match") : t("empty.no_requests")}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {searchQuery
                      ? t("empty.try_different")
                      : activeTab === "all"
                        ? t("empty.all_hint")
                        : activeTab === "pending_approval"
                          ? t("empty.pending_hint")
                          : t("empty.tab_hint", {
                              tab: activeTab,
                            })}
                  </Text>
                </Stack>
              </Center>
            )}
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Container>
  );
}

export const Route = createFileRoute("/requests")({
  beforeLoad: async () => {
    await requireAuth();
  },
  component: RequestsPage,
});
