import {
  Stack,
  Paper,
  Title,
  Text,
  Group,
  Select,
  PasswordInput,
  Button,
  Badge,
  Loader,
  Center,
  Table,
  Tooltip,
  Alert,
} from "@mantine/core";
import { IconRefresh, IconCheck, IconAlertCircle } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  useListSettings,
  useUpdateListSettings,
  useListStats,
  useCheckNow,
  useAllLists,
  type ListFetchInterval,
} from "../hooks/useLists";

// Interval options
const intervalOptions: { value: ListFetchInterval; label: string }[] = [
  { value: "15min", label: "Every 15 minutes" },
  { value: "30min", label: "Every 30 minutes" },
  { value: "1h", label: "Every hour" },
  { value: "6h", label: "Every 6 hours" },
  { value: "12h", label: "Every 12 hours" },
  { value: "24h", label: "Every 24 hours" },
];

// Source colors (brand colors)
const sourceColors: Record<string, { bg: string; text: string }> = {
  goodreads: { bg: "#B7AD98", text: "#000" },
  storygraph: { bg: "#14919B", text: "#fff" },
  hardcover: { bg: "#6466F1", text: "#fff" },
};

export default function ListsSettings() {
  const { data: settings, isLoading: settingsLoading } = useListSettings();
  const { data: stats, isLoading: statsLoading } = useListStats();
  const { data: allLists, isLoading: listsLoading } = useAllLists();
  const updateSettings = useUpdateListSettings();
  const checkNow = useCheckNow();

  // Local state for form
  const [interval, setInterval] = useState<ListFetchInterval>("6h");
  const [hardcoverToken, setHardcoverToken] = useState("");
  const [tokenChanged, setTokenChanged] = useState(false);

  // Initialize form state from settings
  useEffect(() => {
    if (settings) {
      setInterval(settings.listFetchInterval);
      // Don't set token - it's masked on server
    }
  }, [settings]);

  const handleSave = () => {
    const updates: {
      listFetchInterval?: ListFetchInterval;
      hardcoverApiToken?: string;
    } = {};

    if (settings?.listFetchInterval !== interval) {
      updates.listFetchInterval = interval;
    }

    if (tokenChanged && hardcoverToken) {
      updates.hardcoverApiToken = hardcoverToken;
    }

    if (Object.keys(updates).length === 0) {
      notifications.show({
        title: "No changes",
        message: "No changes to save",
        color: "blue",
      });
      return;
    }

    updateSettings.mutate(updates, {
      onSuccess: () => {
        notifications.show({
          title: "Settings saved",
          message: "List import settings have been updated",
          color: "green",
        });
        setTokenChanged(false);
        setHardcoverToken("");
      },
      onError: (error) => {
        notifications.show({
          title: "Error",
          message: error.message,
          color: "red",
        });
      },
    });
  };

  const handleCheckNow = () => {
    checkNow.mutate(undefined, {
      onSuccess: () => {
        notifications.show({
          title: "Check started",
          message: "All enabled lists are being checked for new books",
          color: "green",
        });
      },
      onError: (error) => {
        notifications.show({
          title: "Error",
          message: error.message,
          color: "red",
        });
      },
    });
  };

  if (settingsLoading || statsLoading) {
    return (
      <Center p="xl">
        <Loader size="lg" />
      </Center>
    );
  }

  return (
    <Stack gap="lg">
      {/* Stats Overview */}
      <Paper p="md" withBorder>
        <Stack gap="md">
          <Group justify="space-between">
            <Title order={3}>Import Lists Overview</Title>
            <Button
              variant="light"
              leftSection={<IconRefresh size={16} />}
              onClick={handleCheckNow}
              loading={checkNow.isPending || stats?.isCheckerRunning}
              disabled={stats?.isCheckerRunning}
            >
              {stats?.isCheckerRunning ? "Checking..." : "Check All Now"}
            </Button>
          </Group>

          <Group gap="md">
            <Badge size="lg" variant="light" color="blue">
              {stats?.totalLists || 0} Total Lists
            </Badge>
            <Badge size="lg" variant="light" color="green">
              {stats?.enabledLists || 0} Enabled
            </Badge>
            <Badge size="lg" variant="light" color="grape">
              {stats?.totalBooksImported || 0} Books Imported
            </Badge>
          </Group>

          {stats?.listsBySource &&
            Object.keys(stats.listsBySource).length > 0 && (
              <Group gap="xs">
                <Text size="sm" c="dimmed">
                  By source:
                </Text>
                {Object.entries(stats.listsBySource).map(([source, count]) => {
                  const colors = sourceColors[source] || {
                    bg: "#gray",
                    text: "#000",
                  };
                  return (
                    <Badge
                      key={source}
                      size="sm"
                      style={{
                        backgroundColor: colors.bg,
                        color: colors.text,
                      }}
                    >
                      {source}: {count}
                    </Badge>
                  );
                })}
              </Group>
            )}
        </Stack>
      </Paper>

      {/* Settings */}
      <Paper p="md" withBorder>
        <Stack gap="md">
          <Title order={3}>Settings</Title>

          <Select
            label="Check Interval"
            description="How often to check enabled lists for new books"
            data={intervalOptions}
            value={interval}
            onChange={(v) => setInterval(v as ListFetchInterval)}
          />

          <PasswordInput
            label="Hardcover API Token"
            description={
              settings?.hardcoverApiToken ? (
                "Token is configured. Enter a new value to change it."
              ) : (
                <>
                  Required for Hardcover list imports.{" "}
                  <a
                    href="https://hardcover.app/account/api"
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                  >
                    Get your token here
                  </a>
                </>
              )
            }
            placeholder={
              settings?.hardcoverApiToken
                ? "***configured***"
                : "Enter token..."
            }
            value={hardcoverToken}
            onChange={(e) => {
              setHardcoverToken(e.currentTarget.value);
              setTokenChanged(true);
            }}
          />

          <Group justify="flex-end">
            <Button
              onClick={handleSave}
              loading={updateSettings.isPending}
              leftSection={<IconCheck size={16} />}
            >
              Save Settings
            </Button>
          </Group>
        </Stack>
      </Paper>

      {/* All Lists Table */}
      <Paper p="md" withBorder>
        <Stack gap="md">
          <Title order={3}>All Users' Lists</Title>
          <Text size="sm" c="dimmed">
            Overview of all import lists across all users
          </Text>

          {listsLoading ? (
            <Center p="md">
              <Loader />
            </Center>
          ) : allLists && allLists.length > 0 ? (
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Source</Table.Th>
                  <Table.Th>User</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Books</Table.Th>
                  <Table.Th>Last Checked</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {allLists.map((list) => (
                  <Table.Tr key={list.id}>
                    <Table.Td>{list.name}</Table.Td>
                    <Table.Td>
                      {(() => {
                        const colors = sourceColors[list.source] || {
                          bg: "#gray",
                          text: "#000",
                        };
                        return (
                          <Badge
                            size="sm"
                            style={{
                              backgroundColor: colors.bg,
                              color: colors.text,
                            }}
                          >
                            {list.source}
                          </Badge>
                        );
                      })()}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {list.userId.slice(0, 8)}...
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4}>
                        <Badge
                          size="xs"
                          color={list.enabled ? "green" : "gray"}
                        >
                          {list.enabled ? "Active" : "Disabled"}
                        </Badge>
                        {list.fetchError && (
                          <Tooltip label={list.fetchError}>
                            <Badge size="xs" color="red">
                              Error
                            </Badge>
                          </Tooltip>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td>{list.totalBooksImported}</Table.Td>
                    <Table.Td>
                      {list.lastFetchedAt ? (
                        <Text size="sm">
                          {formatDistanceToNow(new Date(list.lastFetchedAt), {
                            addSuffix: true,
                          })}
                        </Text>
                      ) : (
                        <Text size="sm" c="dimmed">
                          Never
                        </Text>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          ) : (
            <Alert color="blue" icon={<IconAlertCircle size={16} />}>
              No import lists have been created yet. Users can add lists from
              the Lists page.
            </Alert>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}
