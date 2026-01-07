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
  Switch,
} from "@mantine/core";
import { IconRefresh, IconCheck, IconAlertCircle } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useState, useEffect } from "react";
import {
  useListSettings,
  useUpdateListSettings,
  useListStats,
  useCheckNow,
  useAllLists,
  type ListFetchInterval,
} from "../hooks/useLists";
import { SOURCE_COLORS } from "@ephemera/shared";
import { useTranslation, Trans } from "react-i18next";
import { formatDistanceToNowLocalized } from "../utils/date-utils";

// Interval options
const intervalOptions: { value: ListFetchInterval; label: string }[] = [
  { value: "15min", label: "Every 15 minutes" },
  { value: "30min", label: "Every 30 minutes" },
  { value: "1h", label: "Every hour" },
  { value: "6h", label: "Every 6 hours" },
  { value: "12h", label: "Every 12 hours" },
  { value: "24h", label: "Every 24 hours" },
];

export default function ListsSettings() {
  const { t, i18n } = useTranslation("translation", {
    keyPrefix: "settings.lists",
  });
  const { data: settings, isLoading: settingsLoading } = useListSettings();
  const { data: stats, isLoading: statsLoading } = useListStats();
  const { data: allLists, isLoading: listsLoading } = useAllLists();
  const updateSettings = useUpdateListSettings();
  const checkNow = useCheckNow();

  // Local state for form
  const [interval, setInterval] = useState<ListFetchInterval>("6h");
  const [hardcoverToken, setHardcoverToken] = useState("");
  const [tokenChanged, setTokenChanged] = useState(false);
  const [searchByIsbnFirst, setSearchByIsbnFirst] = useState(true);
  const [includeYearInSearch, setIncludeYearInSearch] = useState(true);
  const [embedMetadataInBooks, setEmbedMetadataInBooks] = useState(true);

  // Initialize form state from settings
  useEffect(() => {
    if (settings) {
      setInterval(settings.listFetchInterval);
      setSearchByIsbnFirst(settings.searchByIsbnFirst);
      setIncludeYearInSearch(settings.includeYearInSearch);
      setEmbedMetadataInBooks(settings.embedMetadataInBooks);
      // Don't set token - it's masked on server
    }
  }, [settings]);

  const handleSave = () => {
    const updates: {
      listFetchInterval?: ListFetchInterval;
      hardcoverApiToken?: string;
      searchByIsbnFirst?: boolean;
      includeYearInSearch?: boolean;
      embedMetadataInBooks?: boolean;
    } = {};

    if (settings?.listFetchInterval !== interval) {
      updates.listFetchInterval = interval;
    }

    if (tokenChanged && hardcoverToken) {
      updates.hardcoverApiToken = hardcoverToken;
    }

    if (settings?.searchByIsbnFirst !== searchByIsbnFirst) {
      updates.searchByIsbnFirst = searchByIsbnFirst;
    }

    if (settings?.includeYearInSearch !== includeYearInSearch) {
      updates.includeYearInSearch = includeYearInSearch;
    }

    if (settings?.embedMetadataInBooks !== embedMetadataInBooks) {
      updates.embedMetadataInBooks = embedMetadataInBooks;
    }

    if (Object.keys(updates).length === 0) {
      notifications.show({
        title: t("notifications.no_changes.title"),
        message: t("notifications.no_changes.message"),
        color: "blue",
      });
      return;
    }

    updateSettings.mutate(updates, {
      onSuccess: () => {
        notifications.show({
          title: t("notifications.save_success.title"),
          message: t("notifications.save_success.message"),
          color: "green",
        });
        setTokenChanged(false);
        setHardcoverToken("");
      },
      onError: (error) => {
        notifications.show({
          title: t("notifications.error.title"),
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
          title: t("notifications.check_started.title"),
          message: t("notifications.check_started.message"),
          color: "green",
        });
      },
      onError: (error) => {
        notifications.show({
          title: t("notifications.error.title"),
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
            <Title order={3}>{t("overview.title")}</Title>
            <Button
              variant="light"
              leftSection={<IconRefresh size={16} />}
              onClick={handleCheckNow}
              loading={checkNow.isPending || stats?.isCheckerRunning}
              disabled={stats?.isCheckerRunning}
            >
              {stats?.isCheckerRunning
                ? t("overview.checking")
                : t("overview.check_now")}
            </Button>
          </Group>

          <Group gap="md">
            <Badge size="lg" variant="light" color="blue">
              {t("overview.stats.total", { count: stats?.totalLists || 0 })}
            </Badge>
            <Badge size="lg" variant="light" color="green">
              {t("overview.stats.enabled", { count: stats?.enabledLists || 0 })}
            </Badge>
            <Badge size="lg" variant="light" color="grape">
              {t("overview.stats.books", {
                count: stats?.totalBooksImported || 0,
              })}
            </Badge>
          </Group>

          {stats?.listsBySource &&
            Object.keys(stats.listsBySource).length > 0 && (
              <Group gap="xs">
                <Text size="sm" c="dimmed">
                  {t("overview.by_source")}
                </Text>
                {Object.entries(stats.listsBySource).map(([source, count]) => {
                  const colors = SOURCE_COLORS[source] || {
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
          <Title order={3}>{t("form.title")}</Title>

          <Select
            label={t("form.interval.label")}
            description={t("form.interval.description")}
            data={intervalOptions.map((opt) => ({
              ...opt,
              label: t(`form.interval.options.${opt.value}`),
            }))}
            value={interval}
            onChange={(v) => setInterval(v as ListFetchInterval)}
          />

          <PasswordInput
            label={t("form.hardcover_token.label")}
            description={
              settings?.hardcoverApiToken ? (
                t("form.hardcover_token.description_configured")
              ) : (
                <Trans
                  t={t}
                  i18nKey="form.hardcover_token.description_new"
                  components={[
                    <a
                      key="0"
                      href="https://hardcover.app/account/api"
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                    >
                      Get your token here
                    </a>,
                  ]}
                />
              )
            }
            placeholder={
              settings?.hardcoverApiToken
                ? "••••••••••••"
                : t("form.hardcover_token.placeholder")
            }
            value={hardcoverToken}
            onChange={(e) => {
              setHardcoverToken(e.currentTarget.value);
              setTokenChanged(true);
            }}
          />

          <Title order={4} mt="md">
            {t("form.search_enhancement.title")}
          </Title>

          <Switch
            label={t("form.search_enhancement.isbn_first.label")}
            description={t("form.search_enhancement.isbn_first.description")}
            checked={searchByIsbnFirst}
            onChange={(e) => setSearchByIsbnFirst(e.currentTarget.checked)}
          />

          <Switch
            label={t("form.search_enhancement.include_year.label")}
            description={t("form.search_enhancement.include_year.description")}
            checked={includeYearInSearch}
            onChange={(e) => setIncludeYearInSearch(e.currentTarget.checked)}
          />

          <Title order={4} mt="md">
            {t("form.post_processing.title")}
          </Title>

          <Switch
            label={t("form.post_processing.embed_metadata.label")}
            description={t("form.post_processing.embed_metadata.description")}
            checked={embedMetadataInBooks}
            onChange={(e) => setEmbedMetadataInBooks(e.currentTarget.checked)}
          />

          <Group justify="flex-end">
            <Button
              onClick={handleSave}
              loading={updateSettings.isPending}
              leftSection={<IconCheck size={16} />}
            >
              {t("form.save_button")}
            </Button>
          </Group>
        </Stack>
      </Paper>

      {/* All Lists Table */}
      <Paper p="md" withBorder>
        <Stack gap="md">
          <Title order={3}>{t("table.title")}</Title>
          <Text size="sm" c="dimmed">
            {t("table.description")}
          </Text>

          {listsLoading ? (
            <Center p="md">
              <Loader />
            </Center>
          ) : allLists && allLists.length > 0 ? (
            <Table.ScrollContainer minWidth={700}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("table.headers.name")}</Table.Th>
                    <Table.Th>{t("table.headers.source")}</Table.Th>
                    <Table.Th>{t("table.headers.user")}</Table.Th>
                    <Table.Th>{t("table.headers.status")}</Table.Th>
                    <Table.Th>{t("table.headers.books")}</Table.Th>
                    <Table.Th>{t("table.headers.last_checked")}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {allLists.map((list) => (
                    <Table.Tr key={list.id}>
                      <Table.Td>{list.name}</Table.Td>
                      <Table.Td>
                        {(() => {
                          const colors = SOURCE_COLORS[list.source] || {
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
                        <Text size="sm">
                          {list.userName || list.userId.slice(0, 8) + "..."}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4}>
                          <Badge
                            size="xs"
                            color={list.enabled ? "green" : "gray"}
                          >
                            {list.enabled
                              ? t("table.status.active")
                              : t("table.status.disabled")}
                          </Badge>
                          {list.fetchError && (
                            <Tooltip label={list.fetchError}>
                              <Badge size="xs" color="red">
                                {t("table.status.error")}
                              </Badge>
                            </Tooltip>
                          )}
                        </Group>
                      </Table.Td>
                      <Table.Td>{list.totalBooksImported}</Table.Td>
                      <Table.Td>
                        {list.lastFetchedAt ? (
                          <Text size="sm">
                            {formatDistanceToNowLocalized(
                              new Date(list.lastFetchedAt),
                              i18n.language,
                            )}
                          </Text>
                        ) : (
                          <Text size="sm" c="dimmed">
                            {t("table.never")}
                          </Text>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          ) : (
            <Alert color="blue" icon={<IconAlertCircle size={16} />}>
              {t("table.empty")}
            </Alert>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}
