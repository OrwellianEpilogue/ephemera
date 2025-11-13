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
  TextInput,
  Box,
  Button,
  Modal,
} from "@mantine/core";
import {
  IconDownload,
  IconClock,
  IconCheck,
  IconAlertCircle,
  IconX,
  IconFolderCheck,
  IconRefresh,
  IconList,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import { useQueue } from "../hooks/useQueue";
import { DownloadItem } from "../components/DownloadItem";
import { useState, useMemo, useCallback, useRef } from "react";
import type { QueueItem } from "@ephemera/shared";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useClearQueue } from "../hooks/useDownload";

// Virtualized list component for better performance with large lists
function VirtualizedDownloadList({ items }: { items: QueueItem[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 180, // Estimated height of DownloadItem card
    overscan: 5, // Render 5 extra items above and below viewport for smooth scrolling
  });

  return (
    <Box
      ref={parentRef}
      style={{
        height: "calc(100vh - 300px)", // Adjust based on header/tabs height
        overflow: "auto",
      }}
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualItem) => {
          const item = items[virtualItem.index];
          // Guard against undefined items
          if (!item) return null;

          return (
            <div
              key={item.md5}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualItem.start}px)`,
                paddingBottom: "1rem", // Gap between items (matches Mantine Stack gap="md")
              }}
            >
              <DownloadItem item={item} />
            </div>
          );
        })}
      </div>
    </Box>
  );
}

function QueuePage() {
  // 1. Call ALL hooks first (before any conditional returns)
  const { data: queue, isLoading, isError } = useQueue({ enableSSE: false });
  const [searchQuery, setSearchQuery] = useState("");
  const [clearModalOpened, setClearModalOpened] = useState(false);
  const clearQueue = useClearQueue();

  // 2. Convert queue records to arrays (with safe fallbacks) - memoized to prevent recalculation
  const downloading = useMemo(
    () => Object.values(queue?.downloading || {}),
    [queue?.downloading],
  );
  const queued = useMemo(
    () => Object.values(queue?.queued || {}),
    [queue?.queued],
  );
  const available = useMemo(
    () => Object.values(queue?.available || {}),
    [queue?.available],
  );
  const done = useMemo(() => Object.values(queue?.done || {}), [queue?.done]);
  const delayed = useMemo(
    () => Object.values(queue?.delayed || {}),
    [queue?.delayed],
  );
  const error = useMemo(
    () => Object.values(queue?.error || {}),
    [queue?.error],
  );
  const cancelled = useMemo(
    () => Object.values(queue?.cancelled || {}),
    [queue?.cancelled],
  );

  // 3. Define all callbacks and memos
  const filterDownloads = useCallback(
    (items: QueueItem[]) => {
      if (!searchQuery.trim()) return items;
      const query = searchQuery.toLowerCase();
      return items.filter((item) => {
        return (
          item.title?.toLowerCase().includes(query) ||
          item.authors?.some((author: string) =>
            author.toLowerCase().includes(query),
          ) ||
          item.md5?.toLowerCase().includes(query) ||
          item.format?.toLowerCase().includes(query) ||
          item.language?.toLowerCase().includes(query) ||
          item.publisher?.toLowerCase().includes(query)
        );
      });
    },
    [searchQuery],
  );

  // Apply filters to each category
  const filteredDownloading = useMemo(
    () => filterDownloads(downloading),
    [downloading, filterDownloads],
  );
  const filteredQueued = useMemo(
    () => filterDownloads(queued),
    [queued, filterDownloads],
  );
  const filteredAvailable = useMemo(
    () => filterDownloads(available),
    [available, filterDownloads],
  );
  const filteredDone = useMemo(
    () => filterDownloads(done),
    [done, filterDownloads],
  );
  const filteredDelayed = useMemo(
    () => filterDownloads(delayed),
    [delayed, filterDownloads],
  );
  const filteredError = useMemo(
    () => filterDownloads(error),
    [error, filterDownloads],
  );
  const filteredCancelled = useMemo(
    () => filterDownloads(cancelled),
    [cancelled, filterDownloads],
  );

  // Combine all downloads and sort by queuedAt (newest first)
  const allDownloads = useMemo(() => {
    return [
      ...filteredDownloading,
      ...filteredQueued,
      ...filteredAvailable,
      ...filteredDone,
      ...filteredDelayed,
      ...filteredError,
      ...filteredCancelled,
    ].sort((a, b) => {
      // queuedAt is a string (datetime), convert to timestamp for comparison
      const timeA = a.queuedAt ? new Date(a.queuedAt).getTime() : 0;
      const timeB = b.queuedAt ? new Date(b.queuedAt).getTime() : 0;
      return timeB - timeA;
    });
  }, [
    filteredDownloading,
    filteredQueued,
    filteredAvailable,
    filteredDone,
    filteredDelayed,
    filteredError,
    filteredCancelled,
  ]);

  const totalActive = downloading.length + queued.length + delayed.length;

  // Count clearable downloads (done, available, error, cancelled)
  const clearableCount =
    done.length + available.length + error.length + cancelled.length;

  const handleClearQueue = () => {
    clearQueue.mutate();
    setClearModalOpened(false);
  };

  // 4. NOW handle conditional returns (after all hooks are called)
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
          <Text c="red">Error loading queue. Please try again.</Text>
        </Center>
      </Container>
    );
  }

  if (!queue) {
    return null;
  }

  return (
    <Container size="xl">
      <Stack gap="lg">
        <Group justify="space-between">
          <Group>
            <Title order={1}>Download Queue</Title>
            {totalActive > 0 && (
              <Badge
                size="lg"
                variant="filled"
                color="blue"
                leftSection={<IconRefresh size={16} />}
              >
                {totalActive} active
              </Badge>
            )}
          </Group>
          <Button
            leftSection={<IconTrash size={16} />}
            color="red"
            variant="light"
            onClick={() => setClearModalOpened(true)}
            disabled={clearableCount === 0}
          >
            Clear Queue
          </Button>
        </Group>

        <TextInput
          placeholder="Search by title, author, format, language, publisher, or MD5..."
          leftSection={<IconSearch size={16} />}
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.currentTarget.value)}
          size="md"
        />

        {/* Clear Queue Confirmation Modal */}
        <Modal
          opened={clearModalOpened}
          onClose={() => setClearModalOpened(false)}
          title="Clear Queue"
          centered
        >
          <Stack gap="md">
            <Text>
              Are you sure you want to clear <strong>{clearableCount}</strong>{" "}
              download{clearableCount !== 1 ? "s" : ""}?
            </Text>
            <Text size="sm" c="dimmed">
              This will delete all completed, available, error, and cancelled
              downloads from the queue. Active downloads (queued, downloading,
              delayed) will not be affected.
            </Text>
            <Text size="sm" c="dimmed" fs="italic">
              Note: Downloaded files will remain on disk.
            </Text>
            <Group justify="flex-end" gap="sm">
              <Button
                variant="subtle"
                color="gray"
                onClick={() => setClearModalOpened(false)}
              >
                Cancel
              </Button>
              <Button
                color="red"
                onClick={handleClearQueue}
                loading={clearQueue.isPending}
                leftSection={<IconTrash size={16} />}
              >
                Clear {clearableCount} Download{clearableCount !== 1 ? "s" : ""}
              </Button>
            </Group>
          </Stack>
        </Modal>

        <Tabs defaultValue="all">
          <Tabs.List>
            <Tabs.Tab
              value="all"
              color="grape"
              leftSection={<IconList size={16} />}
              rightSection={
                allDownloads.length > 0 ? (
                  <Badge
                    size="xs"
                    variant="filled"
                    color="grape"
                    circle={allDownloads.length < 10}
                  >
                    {allDownloads.length}
                  </Badge>
                ) : null
              }
            >
              All
            </Tabs.Tab>

            <Tabs.Tab
              value="downloading"
              color="blue"
              leftSection={<IconDownload size={16} />}
              rightSection={
                filteredDownloading.length > 0 ? (
                  <Badge
                    size="xs"
                    variant="filled"
                    color="blue"
                    circle={filteredDownloading.length < 10}
                  >
                    {filteredDownloading.length}
                  </Badge>
                ) : null
              }
            >
              Downloading
            </Tabs.Tab>

            <Tabs.Tab
              value="queued"
              color="gray"
              leftSection={<IconClock size={16} />}
              rightSection={
                filteredQueued.length > 0 ? (
                  <Badge
                    size="xs"
                    variant="filled"
                    color="gray"
                    circle={filteredQueued.length < 10}
                  >
                    {filteredQueued.length}
                  </Badge>
                ) : null
              }
            >
              Queued
            </Tabs.Tab>

            <Tabs.Tab
              value="delayed"
              color="yellow"
              leftSection={<IconClock size={16} />}
              rightSection={
                filteredDelayed.length > 0 ? (
                  <Badge
                    size="xs"
                    variant="filled"
                    color="yellow"
                    circle={filteredDelayed.length < 10}
                  >
                    {filteredDelayed.length}
                  </Badge>
                ) : null
              }
            >
              Delayed
            </Tabs.Tab>

            <Tabs.Tab
              value="done"
              color="teal"
              leftSection={<IconCheck size={16} />}
              rightSection={
                filteredDone.length > 0 ? (
                  <Badge
                    size="xs"
                    variant="filled"
                    color="teal"
                    circle={filteredDone.length < 10}
                  >
                    {filteredDone.length}
                  </Badge>
                ) : null
              }
            >
              Done
            </Tabs.Tab>

            <Tabs.Tab
              value="available"
              color="green"
              leftSection={<IconFolderCheck size={16} />}
              rightSection={
                filteredAvailable.length > 0 ? (
                  <Badge
                    size="xs"
                    variant="filled"
                    color="green"
                    circle={filteredAvailable.length < 10}
                  >
                    {filteredAvailable.length}
                  </Badge>
                ) : null
              }
            >
              Available
            </Tabs.Tab>

            <Tabs.Tab
              value="error"
              color="red"
              leftSection={<IconAlertCircle size={16} />}
              rightSection={
                filteredError.length > 0 ? (
                  <Badge
                    size="xs"
                    variant="filled"
                    color="red"
                    circle={filteredError.length < 10}
                  >
                    {filteredError.length}
                  </Badge>
                ) : null
              }
            >
              Errors
            </Tabs.Tab>

            <Tabs.Tab
              value="cancelled"
              color="orange"
              leftSection={<IconX size={16} />}
              rightSection={
                filteredCancelled.length > 0 ? (
                  <Badge
                    size="xs"
                    variant="filled"
                    color="orange"
                    circle={filteredCancelled.length < 10}
                  >
                    {filteredCancelled.length}
                  </Badge>
                ) : null
              }
            >
              Cancelled
            </Tabs.Tab>
          </Tabs.List>

          {/* All Tab */}
          <Tabs.Panel value="all" pt="md">
            {allDownloads.length > 0 ? (
              <VirtualizedDownloadList items={allDownloads} />
            ) : (
              <Center p="xl">
                <Stack align="center" gap="sm">
                  <IconList size={48} opacity={0.3} />
                  <Text c="dimmed">No downloads yet</Text>
                </Stack>
              </Center>
            )}
          </Tabs.Panel>

          {/* Downloading Tab */}
          <Tabs.Panel value="downloading" pt="md">
            {filteredDownloading.length > 0 ? (
              <VirtualizedDownloadList items={filteredDownloading} />
            ) : (
              <Center p="xl">
                <Stack align="center" gap="sm">
                  <IconDownload size={48} opacity={0.3} />
                  <Text c="dimmed">
                    {searchQuery
                      ? "No matching downloads"
                      : "No active downloads"}
                  </Text>
                </Stack>
              </Center>
            )}
          </Tabs.Panel>

          {/* Queued Tab */}
          <Tabs.Panel value="queued" pt="md">
            {filteredQueued.length > 0 ? (
              <VirtualizedDownloadList items={filteredQueued} />
            ) : (
              <Center p="xl">
                <Stack align="center" gap="sm">
                  <IconClock size={48} opacity={0.3} />
                  <Text c="dimmed">
                    {searchQuery
                      ? "No matching downloads"
                      : "No queued downloads"}
                  </Text>
                </Stack>
              </Center>
            )}
          </Tabs.Panel>

          {/* Available Tab */}
          <Tabs.Panel value="available" pt="md">
            {filteredAvailable.length > 0 ? (
              <VirtualizedDownloadList items={filteredAvailable} />
            ) : (
              <Center p="xl">
                <Stack align="center" gap="sm">
                  <IconFolderCheck size={48} opacity={0.3} />
                  <Text c="dimmed">
                    {searchQuery
                      ? "No matching downloads"
                      : "No available downloads"}
                  </Text>
                </Stack>
              </Center>
            )}
          </Tabs.Panel>

          {/* Done Tab */}
          <Tabs.Panel value="done" pt="md">
            {filteredDone.length > 0 ? (
              <VirtualizedDownloadList items={filteredDone} />
            ) : (
              <Center p="xl">
                <Stack align="center" gap="sm">
                  <IconCheck size={48} opacity={0.3} />
                  <Text c="dimmed">
                    {searchQuery
                      ? "No matching downloads"
                      : "No completed downloads in temp folder"}
                  </Text>
                </Stack>
              </Center>
            )}
          </Tabs.Panel>

          {/* Delayed Tab */}
          <Tabs.Panel value="delayed" pt="md">
            {filteredDelayed.length > 0 ? (
              <>
                <Card withBorder mb="md" bg="yellow.0">
                  <Group gap="xs">
                    <IconClock size={16} />
                    <Text size="sm">
                      These downloads are delayed due to quota limits. They will
                      retry automatically.
                    </Text>
                  </Group>
                </Card>
                <VirtualizedDownloadList items={filteredDelayed} />
              </>
            ) : (
              <Center p="xl">
                <Stack align="center" gap="sm">
                  <IconClock size={48} opacity={0.3} />
                  <Text c="dimmed">
                    {searchQuery
                      ? "No matching downloads"
                      : "No delayed downloads"}
                  </Text>
                </Stack>
              </Center>
            )}
          </Tabs.Panel>

          {/* Error Tab */}
          <Tabs.Panel value="error" pt="md">
            {filteredError.length > 0 ? (
              <>
                <Card withBorder mb="md" bg="red.0">
                  <Group gap="xs">
                    <IconAlertCircle size={16} />
                    <Text size="sm">
                      These downloads failed. Check the error messages for
                      details.
                    </Text>
                  </Group>
                </Card>
                <VirtualizedDownloadList items={filteredError} />
              </>
            ) : (
              <Center p="xl">
                <Stack align="center" gap="sm">
                  <IconAlertCircle size={48} opacity={0.3} />
                  <Text c="dimmed">
                    {searchQuery
                      ? "No matching downloads"
                      : "No failed downloads"}
                  </Text>
                </Stack>
              </Center>
            )}
          </Tabs.Panel>

          {/* Cancelled Tab */}
          <Tabs.Panel value="cancelled" pt="md">
            {filteredCancelled.length > 0 ? (
              <VirtualizedDownloadList items={filteredCancelled} />
            ) : (
              <Center p="xl">
                <Stack align="center" gap="sm">
                  <IconX size={48} opacity={0.3} />
                  <Text c="dimmed">
                    {searchQuery
                      ? "No matching downloads"
                      : "No cancelled downloads"}
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

export const Route = createFileRoute("/queue")({
  component: QueuePage,
});
