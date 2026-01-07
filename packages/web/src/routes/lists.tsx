import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "../lib/route-auth";
import { usePageTitle } from "../hooks/use-page-title";
import {
  Container,
  Title,
  Stack,
  Center,
  Loader,
  Text,
  Badge,
  Group,
  Card,
  ActionIcon,
  Tooltip,
  Button,
  Modal,
  TextInput,
  Select,
  Switch,
  Alert,
  Divider,
  MultiSelect,
  Collapse,
  Checkbox,
} from "@mantine/core";
import {
  IconList,
  IconPlus,
  IconTrash,
  IconRefresh,
  IconAlertCircle,
  IconCheck,
  IconClock,
  IconBook,
  IconChevronDown,
  IconChevronUp,
} from "@tabler/icons-react";
import { useState, useEffect } from "react";
import { useDisclosure, useDebouncedValue } from "@mantine/hooks";
import {
  useLists,
  useCreateList,
  useDeleteList,
  useRefreshList,
  useUpdateList,
  useListSources,
  useParseUrl,
  useValidateConfig,
  useGoodreadsShelves,
  useHardcoverLists,
  useOpenLibraryLists,
  type ImportList,
  type ListSource,
  type CreateListInput,
} from "../hooks/useLists";
import { notifications } from "@mantine/notifications";
import { SOURCE_CONFIG } from "@ephemera/shared";
import { useTranslation } from "react-i18next";
import { formatDistanceToNowLocalized } from "../utils/date-utils";

// List card component
function ListCard({
  list,
  onRefresh,
}: {
  list: ImportList;
  onRefresh: () => void;
}) {
  const { t, i18n } = useTranslation();
  const deleteList = useDeleteList();
  const updateList = useUpdateList();
  const refreshList = useRefreshList();
  const [showDetails, { toggle: toggleDetails }] = useDisclosure(false);

  const handleDelete = () => {
    if (confirm(t("lists.card.confirm_delete"))) {
      deleteList.mutate(list.id, {
        onSuccess: () => {
          notifications.show({
            title: t("lists.notifications.deleted.title"),
            message: t("lists.notifications.deleted.message", {
              name: list.name,
            }),
            color: "green",
          });
        },
        onError: (error) => {
          notifications.show({
            title: t("lists.notifications.error"),
            message: error.message,
            color: "red",
          });
        },
      });
    }
  };

  const handleToggleEnabled = () => {
    updateList.mutate(
      { id: list.id, data: { enabled: !list.enabled } },
      {
        onSuccess: () => {
          const isEnabled = !list.enabled;
          notifications.show({
            title: isEnabled
              ? t("lists.notifications.state_change.title_enabled")
              : t("lists.notifications.state_change.title_disabled"),
            message: isEnabled
              ? t("lists.notifications.state_change.message_enabled", {
                  name: list.name,
                })
              : t("lists.notifications.state_change.message_disabled", {
                  name: list.name,
                }),
            color: "green",
          });
        },
      },
    );
  };

  const handleRefresh = () => {
    refreshList.mutate(list.id, {
      onSuccess: (result) => {
        if (result.error) {
          notifications.show({
            title: t("lists.notifications.refresh.failed"),
            message: result.error,
            color: "red",
          });
        } else {
          notifications.show({
            title: t("lists.notifications.refresh.success_title"),
            message: t("lists.notifications.refresh.success_message", {
              new: result.newBooks,
              total: result.totalBooks,
            }),
            color: "green",
          });
          onRefresh();
        }
      },
      onError: (error) => {
        notifications.show({
          title: t("lists.notifications.error"),
          message: error.message,
          color: "red",
        });
      },
    });
  };

  const source = SOURCE_CONFIG[list.source];
  const config = list.sourceConfig as Record<string, string>;

  return (
    <Card withBorder padding="md">
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm">
            <Badge
              size="lg"
              style={{ backgroundColor: source.color, color: source.textColor }}
            >
              {source.icon}
            </Badge>
            <div>
              <Text fw={500}>{list.name}</Text>
              <Text size="xs" c="dimmed">
                {source.label}
              </Text>
            </div>
          </Group>
          <Group gap="xs">
            <Badge
              color={list.enabled ? "green" : "gray"}
              variant={list.enabled ? "light" : "outline"}
              size="sm"
            >
              {list.enabled
                ? t("lists.card.status.active")
                : t("lists.card.status.disabled")}
            </Badge>
            {list.fetchError && (
              <Tooltip label={list.fetchError}>
                <Badge color="red" variant="light" size="sm">
                  {t("lists.card.status.error")}
                </Badge>
              </Tooltip>
            )}
          </Group>
        </Group>

        <Group gap="md" style={{ fontSize: "0.85rem" }}>
          <Group gap={4}>
            <IconBook size={14} />
            <Text size="xs">
              {t("lists.card.stats.imported", {
                count: list.totalBooksImported,
              })}
            </Text>
          </Group>
          {list.lastFetchedAt && (
            <Group gap={4}>
              <IconClock size={14} />
              <Text size="xs">
                {t("lists.card.stats.last_checked", {
                  time: formatDistanceToNowLocalized(
                    new Date(list.lastFetchedAt),
                    i18n.language,
                  ),
                })}
              </Text>
            </Group>
          )}
        </Group>

        <Group justify="space-between">
          <Group gap="xs">
            <Button
              size="xs"
              variant="light"
              leftSection={
                showDetails ? (
                  <IconChevronUp size={14} />
                ) : (
                  <IconChevronDown size={14} />
                )
              }
              onClick={toggleDetails}
            >
              {showDetails
                ? t("lists.card.actions.hide")
                : t("lists.card.actions.details")}
            </Button>
          </Group>
          <Group gap="xs">
            <Tooltip
              label={
                list.enabled
                  ? t("lists.card.actions.disable_tooltip")
                  : t("lists.card.actions.enable_tooltip")
              }
            >
              <Switch
                checked={list.enabled}
                onChange={handleToggleEnabled}
                disabled={updateList.isPending}
                size="xs"
              />
            </Tooltip>
            <Tooltip label={t("lists.card.actions.refresh_tooltip")}>
              <ActionIcon
                variant="subtle"
                color="blue"
                onClick={handleRefresh}
                loading={refreshList.isPending}
              >
                <IconRefresh size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t("lists.card.actions.delete_tooltip")}>
              <ActionIcon
                variant="subtle"
                color="red"
                onClick={handleDelete}
                loading={deleteList.isPending}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        <Collapse in={showDetails}>
          <Divider my="xs" />
          <Stack gap="xs">
            <Group gap="xs">
              <Text size="xs" c="dimmed" w={100}>
                {t("lists.card.details.import_mode")}
              </Text>
              <Badge size="xs" variant="light">
                {list.importMode === "all"
                  ? t("lists.card.details.mode_all")
                  : t("lists.card.details.mode_future")}
              </Badge>
            </Group>
            {config.userId && (
              <Group gap="xs">
                <Text size="xs" c="dimmed" w={100}>
                  {t("lists.card.details.user_id")}
                </Text>
                <Text size="xs">{config.userId}</Text>
              </Group>
            )}
            {config.username && (
              <Group gap="xs">
                <Text size="xs" c="dimmed" w={100}>
                  {t("lists.card.details.username")}
                </Text>
                <Text size="xs">{config.username}</Text>
              </Group>
            )}
            {config.shelfName && (
              <Group gap="xs">
                <Text size="xs" c="dimmed" w={100}>
                  {t("lists.card.details.shelf")}
                </Text>
                <Text size="xs">{config.shelfName}</Text>
              </Group>
            )}
            {config.listId && (
              <Group gap="xs">
                <Text size="xs" c="dimmed" w={100}>
                  {t("lists.card.details.list")}
                </Text>
                <Text size="xs">{config.listName || config.listId}</Text>
              </Group>
            )}
            {list.searchDefaults && (
              <Group gap="xs" wrap="wrap">
                <Text size="xs" c="dimmed" w={100}>
                  {t("lists.card.details.filters")}
                </Text>
                {list.searchDefaults.ext && (
                  <Badge size="xs" variant="outline">
                    {t("lists.card.details.format", {
                      values: list.searchDefaults.ext.join(", "),
                    })}
                  </Badge>
                )}
                {list.searchDefaults.lang && (
                  <Badge size="xs" variant="outline">
                    {t("lists.card.details.language", {
                      values: list.searchDefaults.lang.join(", "),
                    })}
                  </Badge>
                )}
                {list.searchDefaults.content && (
                  <Badge size="xs" variant="outline">
                    {t("lists.card.details.content", {
                      values: list.searchDefaults.content.join(", "),
                    })}
                  </Badge>
                )}
              </Group>
            )}
            <Group gap="xs">
              <Text size="xs" c="dimmed" w={100}>
                {t("lists.card.details.created")}
              </Text>
              <Text size="xs">
                {formatDistanceToNowLocalized(
                  new Date(list.createdAt),
                  i18n.language,
                )}
              </Text>
            </Group>
          </Stack>
        </Collapse>
      </Stack>
    </Card>
  );
}

// Add list modal
function AddListModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data: sources } = useListSources();
  const createList = useCreateList();
  const parseUrl = useParseUrl();
  const validateConfig = useValidateConfig();

  // Form state
  const [step, setStep] = useState<"source" | "config" | "options">("source");
  const [selectedSource, setSelectedSource] = useState<ListSource | null>(null);
  const [profileUrl, setProfileUrl] = useState("");
  const [userId, setUserId] = useState("");
  const [username, setUsername] = useState("");
  const [selectedShelf, setSelectedShelf] = useState<string | null>(null);
  const [selectedList, setSelectedList] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<"future" | "all">("future");
  const [useBookLanguage, setUseBookLanguage] = useState(true);
  const [formats, setFormats] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);

  // StoryGraph validation state
  const [sgValidation, setSgValidation] = useState<{
    valid: boolean;
    error?: string;
  } | null>(null);

  // Debounce inputs that trigger API calls (500ms delay)
  const [debouncedProfileUrl] = useDebouncedValue(profileUrl, 500);
  const [debouncedUsername] = useDebouncedValue(username, 500);

  // Fetch shelves/lists based on source (using debounced values)
  const { data: shelves, isLoading: shelvesLoading } = useGoodreadsShelves(
    selectedSource === "goodreads" ? userId : undefined,
  );
  const {
    data: hardcoverLists,
    isLoading: listsLoading,
    isError: listsError,
  } = useHardcoverLists(
    selectedSource === "hardcover" ? debouncedUsername : undefined,
  );
  const { data: openlibraryLists, isLoading: olListsLoading } =
    useOpenLibraryLists(
      selectedSource === "openlibrary" ? debouncedUsername : undefined,
    );

  // Auto-parse Goodreads URL when entered (using debounced value)
  useEffect(() => {
    if (
      selectedSource === "goodreads" &&
      debouncedProfileUrl &&
      debouncedProfileUrl.includes("goodreads.com") &&
      !parseUrl.isPending &&
      !userId
    ) {
      parseUrl.mutate(
        { source: "goodreads", url: debouncedProfileUrl },
        {
          onSuccess: (result) => {
            if (result.userId) {
              setUserId(result.userId);
            }
          },
        },
      );
    }
  }, [debouncedProfileUrl, selectedSource]);

  // Auto-parse Babelio URL when entered
  useEffect(() => {
    if (
      selectedSource === "babelio" &&
      debouncedProfileUrl &&
      debouncedProfileUrl.includes("babelio.com") &&
      !parseUrl.isPending &&
      !userId
    ) {
      parseUrl.mutate(
        { source: "babelio", url: debouncedProfileUrl },
        {
          onSuccess: (result) => {
            if (result.userId) {
              setUserId(result.userId); // userId contains the list ID for Babelio
            }
          },
        },
      );
    }
  }, [debouncedProfileUrl, selectedSource]);

  // Validate StoryGraph username when entered (using debounced value)
  useEffect(() => {
    if (
      selectedSource === "storygraph" &&
      debouncedUsername &&
      debouncedUsername.length >= 2
    ) {
      setSgValidation(null); // Reset while validating
      validateConfig.mutate(
        { source: "storygraph", config: { username: debouncedUsername } },
        {
          onSuccess: (result) => setSgValidation(result),
          onError: () =>
            setSgValidation({
              valid: false,
              error: t("lists.validation.failed"),
            }),
        },
      );
    } else if (selectedSource === "storygraph") {
      setSgValidation(null);
    }
  }, [debouncedUsername, selectedSource]);

  const handleSubmit = () => {
    if (!selectedSource) return;

    const sourceConfig: Record<string, unknown> = {};
    let name = "";

    if (selectedSource === "goodreads") {
      sourceConfig.userId = userId;
      sourceConfig.shelfName = selectedShelf || "to-read";
      // Get shelf name from shelves data or use default names
      const shelfData = shelves?.find((s) => s.id === selectedShelf);
      name =
        shelfData?.name ||
        (selectedShelf === "to-read"
          ? "Want to Read"
          : selectedShelf === "currently-reading"
            ? "Currently Reading"
            : selectedShelf === "read"
              ? "Read"
              : selectedShelf || "Want to Read");
    } else if (selectedSource === "storygraph") {
      sourceConfig.username = username;
      name = "To Read";
    } else if (selectedSource === "babelio") {
      sourceConfig.listId = userId;
      name = `Babelio List ${userId}`;
    } else if (selectedSource === "hardcover") {
      sourceConfig.username = username;
      if (selectedList && selectedList !== "__want_to_read__") {
        sourceConfig.listId = selectedList;
        const listData = hardcoverLists?.find((l) => l.id === selectedList);
        name = listData?.name || "List";
      } else {
        name = "Want to Read";
      }
    } else if (selectedSource === "openlibrary") {
      sourceConfig.username = username;
      // Parse the selectedList format: "reading-log:shelf" or "custom:listId"
      if (selectedList?.startsWith("reading-log:")) {
        sourceConfig.listType = "reading-log";
        const shelf = selectedList.replace("reading-log:", "");
        sourceConfig.shelf = shelf;
        // Get display name from list data
        const listData = openlibraryLists?.find((l) => l.id === selectedList);
        name = listData?.name || shelf;
      } else if (selectedList?.startsWith("custom:")) {
        sourceConfig.listType = "custom-list";
        sourceConfig.listId = selectedList.replace("custom:", "");
        // Get list name from openlibraryLists data
        const listData = openlibraryLists?.find((l) => l.id === selectedList);
        name = listData?.name || "List";
      }
    }

    const data: CreateListInput = {
      source: selectedSource,
      name,
      sourceConfig,
      importMode,
      useBookLanguage,
      searchDefaults:
        formats.length > 0 || languages.length > 0
          ? {
              ext: formats.length > 0 ? formats : undefined,
              lang: languages.length > 0 ? languages : undefined,
            }
          : undefined,
    };

    createList.mutate(data, {
      onSuccess: () => {
        notifications.show({
          title: t("lists.notifications.created.title"),
          message: t("lists.notifications.created.message", { name }),
          color: "green",
        });
        handleClose();
      },
      onError: (error) => {
        notifications.show({
          title: t("lists.notifications.create_error"),
          message: error.message,
          color: "red",
        });
      },
    });
  };

  const handleClose = () => {
    setStep("source");
    setSelectedSource(null);
    setProfileUrl("");
    setUserId("");
    setUsername("");
    setSelectedShelf(null);
    setSelectedList(null);
    setImportMode("future");
    setUseBookLanguage(true);
    setFormats([]);
    setLanguages([]);
    setSgValidation(null);
    onClose();
  };

  const canProceed = () => {
    if (step === "source") return !!selectedSource;
    if (step === "config") {
      if (selectedSource === "goodreads") return !!userId && !!selectedShelf;
      if (selectedSource === "babelio") return !!userId;
      if (selectedSource === "storygraph")
        return !!username && sgValidation?.valid === true;
      if (selectedSource === "hardcover") return !!username;
      if (selectedSource === "openlibrary") return !!username && !!selectedList;
    }
    return true;
  };

  const getSourceStatus = (source: ListSource) => {
    const info = sources?.find((s) => s.id === source);
    if (!info) return null;
    if (info.requiresApiKey) return t("lists.source_status.api_key");
    if (info.requiresFlareSolverr) return t("lists.source_status.flaresolverr");
    return null;
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={t("lists.add_modal.title")}
      size="md"
      centered
    >
      <Stack gap="md">
        {step === "source" && (
          <>
            <Text size="sm" c="dimmed">
              {t("lists.add_modal.steps.select_platform")}
            </Text>
            <Stack gap="xs">
              {(
                [
                  "hardcover",
                  "goodreads",
                  "storygraph",
                  "openlibrary",
                  "babelio",
                ] as ListSource[]
              ).map((source) => {
                const config = SOURCE_CONFIG[source];
                const status = getSourceStatus(source);
                const isDisabled = !!status;

                return (
                  <Card
                    key={source}
                    withBorder
                    padding="sm"
                    style={{
                      cursor: isDisabled ? "not-allowed" : "pointer",
                      opacity: isDisabled ? 0.5 : 1,
                      borderColor:
                        selectedSource === source ? config.color : undefined,
                      borderWidth: selectedSource === source ? 2 : 1,
                    }}
                    onClick={() => !isDisabled && setSelectedSource(source)}
                  >
                    <Group justify="space-between">
                      <Group gap="sm">
                        <Badge
                          style={{
                            backgroundColor: config.color,
                            color: config.textColor,
                          }}
                        >
                          {config.icon}
                        </Badge>
                        <div>
                          <Text fw={500}>{config.label}</Text>
                          {status && (
                            <Text size="xs" c="red">
                              {status}
                            </Text>
                          )}
                        </div>
                      </Group>
                      {selectedSource === source && (
                        <IconCheck size={20} color="green" />
                      )}
                    </Group>
                  </Card>
                );
              })}
            </Stack>
          </>
        )}

        {step === "config" && selectedSource === "babelio" && (
          <>
            <TextInput
              label={t("lists.add_modal.fields.babelio_url_id.label")}
              placeholder={t(
                "lists.add_modal.fields.babelio_url_id.placeholder",
              )}
              value={profileUrl || userId}
              onChange={(e) => {
                const val = e.currentTarget.value;
                if (val.includes("babelio.com")) {
                  setProfileUrl(val);
                } else {
                  setUserId(val);
                }
              }}
              rightSection={
                parseUrl.isPending ? (
                  <Loader size="xs" />
                ) : userId ? (
                  <IconCheck size={16} color="green" />
                ) : null
              }
            />
            {userId && (
              <Text size="xs" c="green">
                {t("lists.add_modal.fields.babelio_url_id.success", {
                  id: userId,
                })}
              </Text>
            )}
            <Alert color="blue" icon={<IconAlertCircle size={16} />}>
              {t("lists.add_modal.alerts.babelio_info")}
            </Alert>
          </>
        )}

        {step === "config" && selectedSource === "goodreads" && (
          <>
            <TextInput
              label={t("lists.add_modal.fields.profile_url_id.label")}
              placeholder={t(
                "lists.add_modal.fields.profile_url_id.placeholder",
              )}
              value={profileUrl || userId}
              onChange={(e) => {
                const val = e.currentTarget.value;
                if (val.includes("goodreads.com")) {
                  setProfileUrl(val);
                } else {
                  setUserId(val);
                }
              }}
              rightSection={
                parseUrl.isPending ? (
                  <Loader size="xs" />
                ) : userId ? (
                  <IconCheck size={16} color="green" />
                ) : null
              }
            />
            {userId && (
              <Text size="xs" c="green">
                {t("lists.add_modal.fields.profile_url_id.success", {
                  id: userId,
                })}
              </Text>
            )}
            <Select
              label={t("lists.add_modal.fields.shelf.label")}
              placeholder={
                shelvesLoading
                  ? t("lists.add_modal.fields.shelf.loading")
                  : t("lists.add_modal.fields.shelf.placeholder")
              }
              data={
                shelves?.map((s) => ({ value: s.id, label: s.name })) || [
                  { value: "to-read", label: "Want to Read" },
                  { value: "currently-reading", label: "Currently Reading" },
                  { value: "read", label: "Read" },
                ]
              }
              value={selectedShelf}
              onChange={setSelectedShelf}
              disabled={!userId || shelvesLoading}
            />
            <Alert
              color="blue"
              icon={<IconAlertCircle size={16} />}
              variant="light"
            >
              {t("lists.add_modal.alerts.goodreads_delay")}
            </Alert>
          </>
        )}

        {step === "config" && selectedSource === "storygraph" && (
          <>
            <TextInput
              label={t("lists.add_modal.fields.username.label")}
              placeholder={t("lists.add_modal.fields.username.placeholder")}
              value={username}
              onChange={(e) => setUsername(e.currentTarget.value)}
              description={
                validateConfig.isPending
                  ? t("lists.add_modal.fields.username.checking")
                  : sgValidation?.valid
                    ? t("lists.add_modal.fields.username.accessible")
                    : undefined
              }
              error={
                sgValidation?.valid === false ? sgValidation.error : undefined
              }
              rightSection={
                validateConfig.isPending ? (
                  <Loader size="xs" />
                ) : sgValidation?.valid ? (
                  <IconCheck size={16} color="green" />
                ) : null
              }
              required
            />
            <Alert color="blue" icon={<IconAlertCircle size={16} />}>
              {t("lists.add_modal.alerts.storygraph_warning")}
            </Alert>
          </>
        )}

        {step === "config" && selectedSource === "hardcover" && (
          <>
            <TextInput
              label={t("lists.add_modal.fields.username.label")}
              placeholder={t("lists.add_modal.fields.username.placeholder")}
              value={username}
              onChange={(e) => setUsername(e.currentTarget.value)}
              description={
                username && listsLoading
                  ? t("lists.add_modal.fields.username.verifying")
                  : undefined
              }
              required
            />
            {username && listsLoading && (
              <Group gap="xs">
                <Loader size="xs" />
                <Text size="sm" c="dimmed">
                  {t("lists.add_modal.fields.list.loading", {
                    username,
                  })}
                </Text>
              </Group>
            )}
            {username && listsError && (
              <Alert color="red" icon={<IconAlertCircle size={16} />}>
                {t("lists.add_modal.alerts.hardcover_error")}
              </Alert>
            )}
            {username &&
              !listsLoading &&
              !listsError &&
              hardcoverLists &&
              hardcoverLists.length > 0 && (
                <Select
                  label={t("lists.add_modal.fields.list.label")}
                  placeholder={t("lists.add_modal.fields.list.placeholder")}
                  data={hardcoverLists.map((l) => ({
                    value: l.id,
                    label: l.name,
                  }))}
                  value={selectedList}
                  onChange={setSelectedList}
                />
              )}
          </>
        )}

        {step === "config" && selectedSource === "openlibrary" && (
          <>
            <TextInput
              label={t("lists.add_modal.fields.username.label")}
              placeholder={t("lists.add_modal.fields.username.placeholder")}
              value={username}
              onChange={(e) => setUsername(e.currentTarget.value)}
              description={
                username && olListsLoading
                  ? t("lists.add_modal.fields.username.verifying")
                  : undefined
              }
              required
            />
            {username && olListsLoading && (
              <Group gap="xs">
                <Loader size="xs" />
                <Text size="sm" c="dimmed">
                  {t("lists.add_modal.fields.list.loading", {
                    username,
                  })}
                </Text>
              </Group>
            )}
            {username &&
              !olListsLoading &&
              openlibraryLists &&
              openlibraryLists.length > 0 && (
                <Select
                  label={t("lists.add_modal.fields.list.label")}
                  placeholder={t("lists.add_modal.fields.list.placeholder")}
                  data={openlibraryLists.map((l) => ({
                    value: l.id,
                    label: l.name,
                  }))}
                  value={selectedList}
                  onChange={setSelectedList}
                />
              )}
          </>
        )}

        {step === "options" && (
          <>
            <Select
              label={t("lists.add_modal.fields.import_mode.label")}
              description={t("lists.add_modal.fields.import_mode.description")}
              data={[
                {
                  value: "future",
                  label: t("lists.add_modal.fields.import_mode.future"),
                },
                {
                  value: "all",
                  label: t("lists.add_modal.fields.import_mode.all"),
                },
              ]}
              value={importMode}
              onChange={(v) => setImportMode(v as "future" | "all")}
            />
            {importMode === "all" && (
              <Alert color="orange" icon={<IconAlertCircle size={16} />}>
                {t("lists.add_modal.alerts.import_all_warning")}
              </Alert>
            )}
            <Divider label={t("lists.add_modal.fields.formats.label")} />
            <MultiSelect
              label={t("lists.add_modal.fields.formats.label")}
              placeholder={t("lists.add_modal.fields.formats.placeholder")}
              data={[
                { value: "epub", label: "EPUB" },
                { value: "azw3", label: "AZW3" },
                { value: "mobi", label: "MOBI" },
                { value: "pdf", label: "PDF" },
              ]}
              value={formats}
              onChange={setFormats}
            />
            {selectedSource === "hardcover" && (
              <Checkbox
                label={t("lists.add_modal.fields.use_book_lang.label")}
                description={t(
                  "lists.add_modal.fields.use_book_lang.description",
                )}
                checked={useBookLanguage}
                onChange={(e) => setUseBookLanguage(e.currentTarget.checked)}
              />
            )}
            <MultiSelect
              label={
                selectedSource === "hardcover" && useBookLanguage
                  ? t("lists.add_modal.fields.languages.label_fallback")
                  : t("lists.add_modal.fields.languages.label")
              }
              placeholder={t("lists.add_modal.fields.languages.placeholder")}
              description={
                selectedSource === "hardcover" && useBookLanguage
                  ? t("lists.add_modal.fields.languages.description")
                  : undefined
              }
              data={[
                { value: "en", label: "English" },
                { value: "de", label: "German" },
                { value: "fr", label: "French" },
                { value: "es", label: "Spanish" },
                { value: "it", label: "Italian" },
                { value: "pt", label: "Portuguese" },
              ]}
              value={languages}
              onChange={setLanguages}
            />
          </>
        )}

        <Group justify="space-between" mt="md">
          {step !== "source" ? (
            <Button
              variant="default"
              onClick={() => setStep(step === "options" ? "config" : "source")}
            >
              {t("lists.add_modal.buttons.back")}
            </Button>
          ) : (
            <div />
          )}
          {step === "options" ? (
            <Button
              onClick={handleSubmit}
              loading={createList.isPending}
              leftSection={<IconCheck size={16} />}
            >
              {t("lists.add_modal.buttons.create")}
            </Button>
          ) : (
            <Button
              onClick={() => setStep(step === "source" ? "config" : "options")}
              disabled={!canProceed()}
            >
              {t("lists.add_modal.buttons.next")}
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}

// Main Lists page
function ListsPage() {
  const { t } = useTranslation();
  usePageTitle(t("lists.title"));
  const [modalOpened, { open: openModal, close: closeModal }] =
    useDisclosure(false);
  const { data: lists, isLoading, isError, refetch } = useLists();

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
          <Text c="red">{t("lists.error")}</Text>
        </Center>
      </Container>
    );
  }

  const enabledCount = lists?.filter((l) => l.enabled).length || 0;
  const totalImported =
    lists?.reduce((sum, l) => sum + l.totalBooksImported, 0) || 0;

  return (
    <Container size="xl">
      <Stack gap="lg">
        <Group justify="space-between">
          <Title order={1}>{t("lists.header.title")}</Title>
          <Button leftSection={<IconPlus size={16} />} onClick={openModal}>
            {t("lists.header.add_button")}
          </Button>
        </Group>

        <Group gap="xs">
          <Badge color="blue" variant="light">
            {t("lists.stats.total_lists", { count: lists?.length || 0 })}
          </Badge>
          <Badge color="green" variant="light">
            {t("lists.stats.active", { count: enabledCount })}
          </Badge>
          <Badge color="grape" variant="light">
            {t("lists.stats.imported", { count: totalImported })}
          </Badge>
        </Group>

        <Text c="dimmed" size="sm">
          {t("lists.header.description")}
        </Text>

        {lists && lists.length > 0 ? (
          <Stack gap="md">
            {lists.map((list) => (
              <ListCard key={list.id} list={list} onRefresh={() => refetch()} />
            ))}
          </Stack>
        ) : (
          <Center p="xl">
            <Stack align="center" gap="sm">
              <IconList size={48} opacity={0.3} />
              <Text c="dimmed">{t("lists.empty.title")}</Text>
              <Text size="sm" c="dimmed">
                {t("lists.empty.description")}
              </Text>
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={openModal}
                mt="sm"
              >
                {t("lists.empty.button")}
              </Button>
            </Stack>
          </Center>
        )}
      </Stack>

      <AddListModal opened={modalOpened} onClose={closeModal} />
    </Container>
  );
}

export const Route = createFileRoute("/lists")({
  beforeLoad: async () => {
    await requireAuth();
  },
  component: ListsPage,
});
