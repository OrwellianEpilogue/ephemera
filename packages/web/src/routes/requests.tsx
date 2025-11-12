import { createFileRoute } from "@tanstack/react-router";
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
} from "@mantine/core";
import {
  IconBookmark,
  IconClock,
  IconCheck,
  IconTrash,
  IconRefresh,
} from "@tabler/icons-react";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  useRequests,
  useRequestStats,
  useDeleteRequest,
} from "../hooks/useRequests";
import type { SavedRequestWithBook } from "@ephemera/shared";

// Request card component
function RequestCard({ request }: { request: SavedRequestWithBook }) {
  const deleteRequest = useDeleteRequest();

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this request?")) {
      deleteRequest.mutate(request.id);
    }
  };

  // Parse query params for display
  const params = request.queryParams || {};
  const filters = [];

  // Helper to normalize string | string[] to string[]
  const toArray = (val: string | string[] | undefined): string[] => {
    if (!val) return [];
    return Array.isArray(val) ? val : [val];
  };

  const extArray = toArray(params.ext);
  if (extArray.length > 0) {
    filters.push(`Format: ${extArray.join(", ")}`);
  }

  const langArray = toArray(params.lang);
  if (langArray.length > 0) {
    filters.push(`Language: ${langArray.join(", ")}`);
  }

  const contentArray = toArray(params.content);
  if (contentArray.length > 0) {
    filters.push(`Content: ${contentArray.join(", ")}`);
  }

  if (params.sort) {
    filters.push(`Sort: ${params.sort}`);
  }

  const statusColor =
    {
      active: "blue",
      fulfilled: "green",
      cancelled: "gray",
    }[request.status as string] || "gray";

  return (
    <Card withBorder padding="md">
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs">
            <IconBookmark size={18} />
            <Text fw={500} style={{ wordBreak: "break-word" }}>
              {params.q || "Unknown search"}
            </Text>
          </Group>
          <Group gap="xs">
            <Badge color={statusColor} size="sm">
              {request.status}
            </Badge>
            <Tooltip label="Delete request">
              <ActionIcon
                variant="subtle"
                color="red"
                onClick={handleDelete}
                loading={deleteRequest.isPending}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

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
          style={{ fontSize: "0.85rem", color: "var(--mantine-color-dimmed)" }}
        >
          <Group gap={4}>
            <IconClock size={14} />
            <Text size="xs">
              Created{" "}
              {formatDistanceToNow(new Date(request.createdAt), {
                addSuffix: true,
              })}
            </Text>
          </Group>

          {request.lastCheckedAt && (
            <Group gap={4}>
              <IconRefresh size={14} />
              <Text size="xs">
                Last checked{" "}
                {formatDistanceToNow(new Date(request.lastCheckedAt), {
                  addSuffix: true,
                })}
              </Text>
            </Group>
          )}

          {request.fulfilledAt && (
            <Group gap={4}>
              <IconCheck size={14} />
              <Text size="xs">
                Fulfilled{" "}
                {formatDistanceToNow(new Date(request.fulfilledAt), {
                  addSuffix: true,
                })}
              </Text>
            </Group>
          )}
        </Group>

        {request.status === "fulfilled" && request.fulfilledBook && (
          <Card withBorder bg="var(--mantine-color-green-light)">
            <Stack gap={4}>
              <Text size="sm" fw={500} c="green">
                Book found & sent to queue
              </Text>
              <Text size="xs">{request.fulfilledBook.title}</Text>
              {request.fulfilledBook.authors &&
                request.fulfilledBook.authors.length > 0 && (
                  <Text size="xs" c="dimmed">
                    by {request.fulfilledBook.authors.join(", ")}
                  </Text>
                )}
              <Group gap={4}>
                {request.fulfilledBook.format && (
                  <Badge size="xs" variant="light">
                    {request.fulfilledBook.format}
                  </Badge>
                )}
                {request.fulfilledBook.language && (
                  <Badge size="xs" variant="light">
                    {request.fulfilledBook.language}
                  </Badge>
                )}
                {request.fulfilledBook.year && (
                  <Badge size="xs" variant="light">
                    {request.fulfilledBook.year}
                  </Badge>
                )}
              </Group>
            </Stack>
          </Card>
        )}
      </Stack>
    </Card>
  );
}

// Main Requests page
function RequestsPage() {
  const [activeTab, setActiveTab] = useState<string>("all");

  // Fetch requests based on active tab
  const statusFilter =
    activeTab === "all"
      ? undefined
      : (activeTab as "active" | "fulfilled" | "cancelled");
  const { data: requests, isLoading, isError } = useRequests(statusFilter);
  const { data: stats } = useRequestStats();

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
          <Text c="red">Error loading requests. Please try again.</Text>
        </Center>
      </Container>
    );
  }

  const tabColors: Record<string, string> = {
    all: "grape",
    active: "blue",
    fulfilled: "green",
    cancelled: "gray",
  };

  return (
    <Container size="xl">
      <Stack gap="lg">
        <Group justify="space-between">
          <Title order={1}>Book Requests</Title>
          {stats && (
            <Group gap="xs">
              <Badge color="blue" variant="light">
                {stats.active} active
              </Badge>
              <Badge color="green" variant="light">
                {stats.fulfilled} fulfilled
              </Badge>
            </Group>
          )}
        </Group>

        <Text c="dimmed" size="sm">
          Saved search requests that are automatically checked for new results
        </Text>

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
                  <Badge size="sm" circle color={tabColors.all}>
                    {stats.total}
                  </Badge>
                ) : null
              }
            >
              All
            </Tabs.Tab>
            <Tabs.Tab
              value="active"
              leftSection={<IconClock size={16} />}
              rightSection={
                stats?.active ? (
                  <Badge size="sm" circle color={tabColors.active}>
                    {stats.active}
                  </Badge>
                ) : null
              }
            >
              Active
            </Tabs.Tab>
            <Tabs.Tab
              value="fulfilled"
              leftSection={<IconCheck size={16} />}
              rightSection={
                stats?.fulfilled ? (
                  <Badge size="sm" circle color={tabColors.fulfilled}>
                    {stats.fulfilled}
                  </Badge>
                ) : null
              }
            >
              Fulfilled
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value={activeTab} pt="md">
            {requests && requests.length > 0 ? (
              <Stack gap="md">
                {requests.map((request) => (
                  <RequestCard key={request.id} request={request} />
                ))}
              </Stack>
            ) : (
              <Center p="xl">
                <Stack align="center" gap="sm">
                  <IconBookmark size={48} opacity={0.3} />
                  <Text c="dimmed">No requests found</Text>
                  <Text size="sm" c="dimmed">
                    {activeTab === "all"
                      ? "Search for a book and save it as a request when no results are found"
                      : `No ${activeTab} requests`}
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
  component: RequestsPage,
});
