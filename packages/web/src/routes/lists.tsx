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
import { formatDistanceToNow } from "date-fns";
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
  type ImportList,
  type ListSource,
  type CreateListInput,
} from "../hooks/useLists";
import { notifications } from "@mantine/notifications";

// Source icons and colors (brand colors)
const sourceConfig: Record<
  ListSource,
  { color: string; textColor: string; label: string; icon: string }
> = {
  goodreads: {
    color: "#B7AD98",
    textColor: "#000",
    label: "Goodreads",
    icon: "GR",
  },
  storygraph: {
    color: "#14919B",
    textColor: "#fff",
    label: "StoryGraph",
    icon: "SG",
  },
  hardcover: {
    color: "#6466F1",
    textColor: "#fff",
    label: "Hardcover",
    icon: "HC",
  },
};

// List card component
function ListCard({
  list,
  onRefresh,
}: {
  list: ImportList;
  onRefresh: () => void;
}) {
  const deleteList = useDeleteList();
  const updateList = useUpdateList();
  const refreshList = useRefreshList();
  const [showDetails, { toggle: toggleDetails }] = useDisclosure(false);

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this list?")) {
      deleteList.mutate(list.id, {
        onSuccess: () => {
          notifications.show({
            title: "List deleted",
            message: `"${list.name}" has been deleted`,
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
    }
  };

  const handleToggleEnabled = () => {
    updateList.mutate(
      { id: list.id, data: { enabled: !list.enabled } },
      {
        onSuccess: () => {
          notifications.show({
            title: list.enabled ? "List disabled" : "List enabled",
            message: `"${list.name}" is now ${list.enabled ? "disabled" : "enabled"}`,
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
            title: "Refresh failed",
            message: result.error,
            color: "red",
          });
        } else {
          notifications.show({
            title: "List refreshed",
            message: `Found ${result.newBooks} new books (${result.totalBooks} total)`,
            color: "green",
          });
          onRefresh();
        }
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

  const source = sourceConfig[list.source];
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
              {list.enabled ? "Active" : "Disabled"}
            </Badge>
            {list.fetchError && (
              <Tooltip label={list.fetchError}>
                <Badge color="red" variant="light" size="sm">
                  Error
                </Badge>
              </Tooltip>
            )}
          </Group>
        </Group>

        <Group gap="md" style={{ fontSize: "0.85rem" }}>
          <Group gap={4}>
            <IconBook size={14} />
            <Text size="xs">{list.totalBooksImported} books imported</Text>
          </Group>
          {list.lastFetchedAt && (
            <Group gap={4}>
              <IconClock size={14} />
              <Text size="xs">
                Last checked{" "}
                {formatDistanceToNow(new Date(list.lastFetchedAt), {
                  addSuffix: true,
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
              {showDetails ? "Hide" : "Details"}
            </Button>
          </Group>
          <Group gap="xs">
            <Tooltip label={list.enabled ? "Disable list" : "Enable list"}>
              <Switch
                checked={list.enabled}
                onChange={handleToggleEnabled}
                disabled={updateList.isPending}
                size="xs"
              />
            </Tooltip>
            <Tooltip label="Refresh now">
              <ActionIcon
                variant="subtle"
                color="blue"
                onClick={handleRefresh}
                loading={refreshList.isPending}
              >
                <IconRefresh size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Delete list">
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
                Import mode:
              </Text>
              <Badge size="xs" variant="light">
                {list.importMode === "all"
                  ? "All books"
                  : "Future additions only"}
              </Badge>
            </Group>
            {config.userId && (
              <Group gap="xs">
                <Text size="xs" c="dimmed" w={100}>
                  User ID:
                </Text>
                <Text size="xs">{config.userId}</Text>
              </Group>
            )}
            {config.username && (
              <Group gap="xs">
                <Text size="xs" c="dimmed" w={100}>
                  Username:
                </Text>
                <Text size="xs">{config.username}</Text>
              </Group>
            )}
            {config.shelfName && (
              <Group gap="xs">
                <Text size="xs" c="dimmed" w={100}>
                  Shelf:
                </Text>
                <Text size="xs">{config.shelfName}</Text>
              </Group>
            )}
            {config.listId && (
              <Group gap="xs">
                <Text size="xs" c="dimmed" w={100}>
                  List:
                </Text>
                <Text size="xs">{config.listName || config.listId}</Text>
              </Group>
            )}
            {list.searchDefaults && (
              <Group gap="xs" wrap="wrap">
                <Text size="xs" c="dimmed" w={100}>
                  Filters:
                </Text>
                {list.searchDefaults.ext && (
                  <Badge size="xs" variant="outline">
                    Format: {list.searchDefaults.ext.join(", ")}
                  </Badge>
                )}
                {list.searchDefaults.lang && (
                  <Badge size="xs" variant="outline">
                    Language: {list.searchDefaults.lang.join(", ")}
                  </Badge>
                )}
                {list.searchDefaults.content && (
                  <Badge size="xs" variant="outline">
                    Content: {list.searchDefaults.content.join(", ")}
                  </Badge>
                )}
              </Group>
            )}
            <Group gap="xs">
              <Text size="xs" c="dimmed" w={100}>
                Created:
              </Text>
              <Text size="xs">
                {formatDistanceToNow(new Date(list.createdAt), {
                  addSuffix: true,
                })}
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
            setSgValidation({ valid: false, error: "Validation failed" }),
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
    } else if (selectedSource === "hardcover") {
      sourceConfig.username = username;
      if (selectedList && selectedList !== "__want_to_read__") {
        sourceConfig.listId = selectedList;
        // Get list name from hardcoverLists data
        const listData = hardcoverLists?.find((l) => l.id === selectedList);
        name = listData?.name || "List";
      } else {
        name = "Want to Read";
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
          title: "List created",
          message: `"${name}" has been created and will be checked periodically`,
          color: "green",
        });
        handleClose();
      },
      onError: (error) => {
        notifications.show({
          title: "Error creating list",
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
      if (selectedSource === "storygraph")
        return !!username && sgValidation?.valid === true;
      if (selectedSource === "hardcover") return !!username;
    }
    return true;
  };

  const getSourceStatus = (source: ListSource) => {
    const info = sources?.find((s) => s.id === source);
    if (!info) return null;
    if (info.requiresApiKey) return "API key required";
    if (info.requiresFlareSolverr) return "FlareSolverr required";
    return null;
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Add Import List"
      size="md"
      centered
    >
      <Stack gap="md">
        {step === "source" && (
          <>
            <Text size="sm" c="dimmed">
              Select the platform you want to import books from:
            </Text>
            <Stack gap="xs">
              {(["hardcover", "goodreads", "storygraph"] as ListSource[]).map(
                (source) => {
                  const config = sourceConfig[source];
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
                },
              )}
            </Stack>
          </>
        )}

        {step === "config" && selectedSource === "goodreads" && (
          <>
            <TextInput
              label="Profile URL or User ID"
              placeholder="https://www.goodreads.com/user/show/12345"
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
                ✓ User ID: {userId}
              </Text>
            )}
            <Select
              label="Shelf"
              placeholder={
                shelvesLoading ? "Loading shelves..." : "Select shelf"
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
              Goodreads RSS feeds may have a delay of 15-60 minutes after adding
              books. Newly added books will be imported on the next scheduled
              check.
            </Alert>
          </>
        )}

        {step === "config" && selectedSource === "storygraph" && (
          <>
            <TextInput
              label="Username"
              placeholder="your_username"
              value={username}
              onChange={(e) => setUsername(e.currentTarget.value)}
              description={
                validateConfig.isPending
                  ? "Checking list access..."
                  : sgValidation?.valid
                    ? "List is accessible"
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
              StoryGraph requires FlareSolverr to bypass Cloudflare protection.
              Only the initial page of your to-read list will be imported.
            </Alert>
          </>
        )}

        {step === "config" && selectedSource === "hardcover" && (
          <>
            <TextInput
              label="Username"
              placeholder="your_username"
              value={username}
              onChange={(e) => setUsername(e.currentTarget.value)}
              description={
                username && listsLoading ? "Verifying username..." : undefined
              }
              required
            />
            {username && listsLoading && (
              <Group gap="xs">
                <Loader size="xs" />
                <Text size="sm" c="dimmed">
                  Loading lists for {username}...
                </Text>
              </Group>
            )}
            {username && listsError && (
              <Alert color="red" icon={<IconAlertCircle size={16} />}>
                Could not fetch lists for this user. Please check the username
                and try again.
              </Alert>
            )}
            {username &&
              !listsLoading &&
              !listsError &&
              hardcoverLists &&
              hardcoverLists.length > 0 && (
                <Select
                  label="List"
                  placeholder="Select list"
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

        {step === "options" && (
          <>
            <Select
              label="Import Mode"
              description="How to handle existing books on the list"
              data={[
                {
                  value: "future",
                  label: "Future additions only (recommended)",
                },
                { value: "all", label: "All books (may create many requests)" },
              ]}
              value={importMode}
              onChange={(v) => setImportMode(v as "future" | "all")}
            />
            {importMode === "all" && (
              <Alert color="orange" icon={<IconAlertCircle size={16} />}>
                This will create download requests for all books currently on
                the list, not just new additions.
              </Alert>
            )}
            <Divider label="Search Filters (Optional)" />
            <MultiSelect
              label="Preferred Formats"
              placeholder="Any format"
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
                label="Use book's language for search"
                description="When enabled, searches use the book's language from Hardcover. Falls back to the languages below if unavailable."
                checked={useBookLanguage}
                onChange={(e) => setUseBookLanguage(e.currentTarget.checked)}
              />
            )}
            <MultiSelect
              label={
                selectedSource === "hardcover" && useBookLanguage
                  ? "Fallback Languages"
                  : "Preferred Languages"
              }
              placeholder="Any language"
              description={
                selectedSource === "hardcover" && useBookLanguage
                  ? "Used when book language is unavailable"
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
              Back
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
              Create List
            </Button>
          ) : (
            <Button
              onClick={() => setStep(step === "source" ? "config" : "options")}
              disabled={!canProceed()}
            >
              Next
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}

// Main Lists page
function ListsPage() {
  usePageTitle("Lists");
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
          <Text c="red">Error loading lists. Please try again.</Text>
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
          <Title order={1}>Import Lists</Title>
          <Button leftSection={<IconPlus size={16} />} onClick={openModal}>
            Add List
          </Button>
        </Group>

        <Group gap="xs">
          <Badge color="blue" variant="light">
            {lists?.length || 0} lists
          </Badge>
          <Badge color="green" variant="light">
            {enabledCount} active
          </Badge>
          <Badge color="grape" variant="light">
            {totalImported} books imported
          </Badge>
        </Group>

        <Text c="dimmed" size="sm">
          Connect your "Want to Read" lists from book tracking platforms. New
          books added to your lists will automatically create download requests.
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
              <Text c="dimmed">No import lists configured</Text>
              <Text size="sm" c="dimmed">
                Add a list to automatically import books from Goodreads,
                StoryGraph, or Hardcover
              </Text>
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={openModal}
                mt="sm"
              >
                Add Your First List
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
