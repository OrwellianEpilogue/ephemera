import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Container,
  Title,
  Text,
  Paper,
  Stack,
  Radio,
  Group,
  Button,
  Loader,
  Center,
  Alert,
  TextInput,
  NumberInput,
  Switch,
  PasswordInput,
  Select,
  Checkbox,
  ActionIcon,
  Tabs,
} from "@mantine/core";
import {
  IconInfoCircle,
  IconPlugConnected,
  IconBell,
  IconTrash,
  IconPlus,
  IconSettings,
  IconUpload,
} from "@tabler/icons-react";
import {
  useAppSettings,
  useUpdateAppSettings,
  useBookloreSettings,
  useUpdateBookloreSettings,
  useTestBookloreConnection,
  useAppriseSettings,
  useUpdateAppriseSettings,
  useTestAppriseNotification,
} from "../hooks/useSettings";
import { useState, useEffect } from "react";
import type {
  PostDownloadAction,
  TimeFormat,
  DateFormat,
  RequestCheckInterval,
  LibraryLinkLocation,
} from "@ephemera/shared";
import { formatDate } from "@ephemera/shared";
import { z } from "zod";

const settingsSearchSchema = z.object({
  tab: z
    .enum(["general", "notifications", "booklore"])
    .optional()
    .default("general"),
});

function SettingsComponent() {
  const navigate = useNavigate({ from: "/settings" });
  const { tab } = Route.useSearch();
  const {
    data: settings,
    isLoading: loadingApp,
    isError: errorApp,
  } = useAppSettings();
  const {
    data: bookloreSettings,
    isLoading: loadingBooklore,
    isError: errorBooklore,
  } = useBookloreSettings();
  const {
    data: appriseSettings,
    isLoading: loadingApprise,
    isError: errorApprise,
  } = useAppriseSettings();
  const updateSettings = useUpdateAppSettings();
  const updateBooklore = useUpdateBookloreSettings();
  const updateApprise = useUpdateAppriseSettings();
  const testConnection = useTestBookloreConnection();
  const testApprise = useTestAppriseNotification();

  // App settings state
  const [postDownloadAction, setPostDownloadAction] =
    useState<PostDownloadAction>("both");
  const [bookRetentionDays, setBookRetentionDays] = useState<number>(30);
  const [requestCheckInterval, setRequestCheckInterval] =
    useState<RequestCheckInterval>("6h");
  const [timeFormat, setTimeFormat] = useState<TimeFormat>("24h");
  const [dateFormat, setDateFormat] = useState<DateFormat>("eur");
  const [libraryUrl, setLibraryUrl] = useState<string>("");
  const [libraryLinkLocation, setLibraryLinkLocation] =
    useState<LibraryLinkLocation>("sidebar");

  // Booklore settings state
  const [bookloreEnabled, setBookloreEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [username, setUsername] = useState(""); // For authentication only
  const [password, setPassword] = useState(""); // For authentication only
  const [libraryId, setLibraryId] = useState<number | "">("");
  const [pathId, setPathId] = useState<number | "">("");
  const [showAuthForm, setShowAuthForm] = useState(false); // Toggle auth form

  // Apprise settings state
  const [appriseEnabled, setAppriseEnabled] = useState(false);
  const [appriseServerUrl, setAppriseServerUrl] = useState("");
  const [customHeaders, setCustomHeaders] = useState<
    Array<{ key: string; value: string }>
  >([]);
  const [notifyOnNewRequest, setNotifyOnNewRequest] = useState(true);
  const [notifyOnDownloadError, setNotifyOnDownloadError] = useState(true);
  const [notifyOnAvailable, setNotifyOnAvailable] = useState(true);
  const [notifyOnDelayed, setNotifyOnDelayed] = useState(true);
  const [notifyOnUpdateAvailable, setNotifyOnUpdateAvailable] = useState(true);
  const [notifyOnRequestFulfilled, setNotifyOnRequestFulfilled] =
    useState(true);
  const [notifyOnBookQueued, setNotifyOnBookQueued] = useState(false);

  // Sync with fetched settings
  useEffect(() => {
    if (settings) {
      // If Booklore is not connected and user has upload-related action selected,
      // reset to move_only
      if (
        !bookloreSettings?.connected &&
        (settings.postDownloadAction === "upload_only" ||
          settings.postDownloadAction === "both")
      ) {
        setPostDownloadAction("move_only");
      } else {
        setPostDownloadAction(settings.postDownloadAction);
      }
      setBookRetentionDays(settings.bookRetentionDays);
      setRequestCheckInterval(settings.requestCheckInterval);
      setTimeFormat(settings.timeFormat);
      setDateFormat(settings.dateFormat);
      setLibraryUrl(settings.libraryUrl || "");
      setLibraryLinkLocation(settings.libraryLinkLocation);
    }
  }, [settings, bookloreSettings?.connected]);

  useEffect(() => {
    if (bookloreSettings) {
      setBookloreEnabled(bookloreSettings.enabled);
      setBaseUrl(bookloreSettings.baseUrl || "");
      setLibraryId(bookloreSettings.libraryId || "");
      setPathId(bookloreSettings.pathId || "");
      // Show auth form only if not connected
      setShowAuthForm(!bookloreSettings.connected);
      // Clear credentials after successful auth
      setUsername("");
      setPassword("");
    }
  }, [bookloreSettings]);

  useEffect(() => {
    if (appriseSettings) {
      setAppriseEnabled(appriseSettings.enabled);
      setAppriseServerUrl(appriseSettings.serverUrl || "");
      const headers = appriseSettings.customHeaders || {};
      setCustomHeaders(
        Object.entries(headers).map(([key, value]) => ({ key, value })),
      );
      setNotifyOnNewRequest(appriseSettings.notifyOnNewRequest);
      setNotifyOnDownloadError(appriseSettings.notifyOnDownloadError);
      setNotifyOnAvailable(appriseSettings.notifyOnAvailable);
      setNotifyOnDelayed(appriseSettings.notifyOnDelayed);
      setNotifyOnUpdateAvailable(appriseSettings.notifyOnUpdateAvailable);
      setNotifyOnRequestFulfilled(appriseSettings.notifyOnRequestFulfilled);
      setNotifyOnBookQueued(appriseSettings.notifyOnBookQueued);
    }
  }, [appriseSettings]);

  const handleSaveApp = () => {
    updateSettings.mutate({
      postDownloadAction,
      bookRetentionDays,
      requestCheckInterval,
      timeFormat,
      dateFormat,
      libraryUrl: libraryUrl || null,
      libraryLinkLocation,
    });
  };

  const handleSaveBooklore = () => {
    updateBooklore.mutate({
      enabled: bookloreEnabled,
      baseUrl: baseUrl || undefined,
      username: username || undefined,
      password: password || undefined,
      libraryId: libraryId || undefined,
      pathId: pathId || undefined,
      autoUpload: true, // Always true - uploads happen when post-download action is set to 'both'
    });
  };

  const handleTestConnection = () => {
    testConnection.mutate();
  };

  const handleSaveApprise = () => {
    const headersObject = customHeaders.reduce(
      (acc, { key, value }) => {
        if (key && value) acc[key] = value;
        return acc;
      },
      {} as Record<string, string>,
    );

    updateApprise.mutate({
      enabled: appriseEnabled,
      serverUrl: appriseServerUrl || null,
      customHeaders:
        Object.keys(headersObject).length > 0 ? headersObject : null,
      notifyOnNewRequest,
      notifyOnDownloadError,
      notifyOnAvailable,
      notifyOnDelayed,
      notifyOnUpdateAvailable,
      notifyOnRequestFulfilled,
      notifyOnBookQueued,
    });
  };

  const handleTestApprise = () => {
    testApprise.mutate();
  };

  const hasAppChanges =
    settings &&
    (settings.postDownloadAction !== postDownloadAction ||
      settings.bookRetentionDays !== bookRetentionDays ||
      settings.requestCheckInterval !== requestCheckInterval ||
      settings.timeFormat !== timeFormat ||
      settings.dateFormat !== dateFormat ||
      (settings.libraryUrl || "") !== libraryUrl ||
      settings.libraryLinkLocation !== libraryLinkLocation);
  // Check if there are unsaved changes OR if this is authentication/re-authentication
  const hasBookloreChanges = bookloreSettings
    ? bookloreSettings.enabled !== bookloreEnabled ||
      bookloreSettings.baseUrl !== baseUrl ||
      bookloreSettings.libraryId !== libraryId ||
      bookloreSettings.pathId !== pathId ||
      // Enable save if user has entered credentials (for auth/re-auth)
      (showAuthForm && username !== "" && password !== "")
    : // New setup: enable save button if user has entered all required values
      bookloreEnabled &&
      baseUrl !== "" &&
      username !== "" &&
      password !== "" &&
      libraryId !== "" &&
      pathId !== "";

  const hasAppriseChanges = appriseSettings
    ? appriseSettings.enabled !== appriseEnabled ||
      appriseSettings.serverUrl !== appriseServerUrl ||
      appriseSettings.notifyOnNewRequest !== notifyOnNewRequest ||
      appriseSettings.notifyOnDownloadError !== notifyOnDownloadError ||
      appriseSettings.notifyOnAvailable !== notifyOnAvailable ||
      appriseSettings.notifyOnDelayed !== notifyOnDelayed ||
      appriseSettings.notifyOnUpdateAvailable !== notifyOnUpdateAvailable ||
      appriseSettings.notifyOnRequestFulfilled !== notifyOnRequestFulfilled ||
      appriseSettings.notifyOnBookQueued !== notifyOnBookQueued ||
      JSON.stringify(appriseSettings.customHeaders || {}) !==
        JSON.stringify(
          customHeaders.reduce(
            (acc, { key, value }) => {
              if (key && value) acc[key] = value;
              return acc;
            },
            {} as Record<string, string>,
          ),
        )
    : false;

  const isLoading = loadingApp || loadingBooklore || loadingApprise;
  const isError = errorApp || errorBooklore || errorApprise;

  if (isLoading) {
    return (
      <Container size="md">
        <Center p="xl">
          <Loader size="lg" />
        </Center>
      </Container>
    );
  }

  if (isError) {
    return (
      <Container size="md">
        <Alert icon={<IconInfoCircle size={16} />} title="Error" color="red">
          Failed to load settings. Please try again.
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="md">
      <Stack gap="lg">
        <Title order={1}>Settings</Title>

        <Tabs
          value={tab}
          onChange={(value) =>
            navigate({
              search: {
                tab: value as "general" | "notifications" | "booklore",
              },
            })
          }
        >
          <Tabs.List>
            <Tabs.Tab value="general" leftSection={<IconSettings size={16} />}>
              General
            </Tabs.Tab>
            <Tabs.Tab
              value="notifications"
              leftSection={<IconBell size={16} />}
            >
              Notifications
            </Tabs.Tab>
            <Tabs.Tab value="booklore" leftSection={<IconUpload size={16} />}>
              Booklore
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="general" pt="lg">
            <Stack gap="lg">
              {/* Post-Download Actions */}
              <Paper p="md" withBorder>
                <Stack gap="md">
                  <Title order={3}>Post-Download Actions</Title>
                  <Text size="sm" c="dimmed">
                    Configure what happens after a book is successfully
                    downloaded
                  </Text>

                  <Radio.Group
                    value={postDownloadAction}
                    onChange={(value) =>
                      setPostDownloadAction(value as PostDownloadAction)
                    }
                  >
                    <Stack gap="sm">
                      <Radio
                        value="move_only"
                        label="Move Only"
                        description="Move downloaded files to your configured ingest folder"
                      />
                      <Radio
                        value="upload_only"
                        label="Upload Only"
                        description="Upload to Booklore and delete the local file (requires Booklore configuration)"
                        disabled={
                          !bookloreSettings?.enabled ||
                          !bookloreSettings?.connected
                        }
                      />
                      <Radio
                        value="both"
                        label="Move and Upload"
                        description="Move to ingest folder AND upload to Booklore (requires Booklore configuration)"
                        disabled={
                          !bookloreSettings?.enabled ||
                          !bookloreSettings?.connected
                        }
                      />
                    </Stack>
                  </Radio.Group>

                  {(!bookloreSettings?.enabled ||
                    !bookloreSettings?.connected) && (
                    <Alert icon={<IconInfoCircle size={16} />} color="blue">
                      <Text size="sm">
                        <strong>Note:</strong>{" "}
                        {!bookloreSettings?.enabled
                          ? "Enable and configure Booklore to use upload options."
                          : "Authenticate with Booklore below to enable upload options."}
                      </Text>
                    </Alert>
                  )}
                </Stack>
              </Paper>

              {/* Requests */}
              <Paper p="md" withBorder>
                <Stack gap="md">
                  <Title order={3}>Requests</Title>
                  <Text size="sm" c="dimmed">
                    Configure how saved book requests are checked
                  </Text>

                  <Select
                    label="Request Check Interval"
                    description="How often to automatically check saved book requests for new results"
                    placeholder="Select interval"
                    value={requestCheckInterval}
                    onChange={(value) =>
                      setRequestCheckInterval(value as RequestCheckInterval)
                    }
                    data={[
                      {
                        value: "1min",
                        label: "Every minute (Not recommended)",
                      },
                      { value: "15min", label: "Every 15 minutes" },
                      { value: "30min", label: "Every 30 minutes" },
                      { value: "1h", label: "Every hour" },
                      { value: "6h", label: "Every 6 hours" },
                      { value: "12h", label: "Every 12 hours" },
                      { value: "24h", label: "Every 24 hours" },
                      { value: "weekly", label: "Weekly" },
                    ]}
                    required
                  />

                  {requestCheckInterval === "1min" && (
                    <Alert icon={<IconInfoCircle size={16} />} color="red">
                      <Text size="sm">
                        <strong>Warning:</strong> Checking every minute may
                        result in excessive requests and could get you banned
                        from the service. Use at your own risk.
                      </Text>
                    </Alert>
                  )}
                </Stack>
              </Paper>

              {/* Display Preferences */}
              <Paper p="md" withBorder>
                <Stack gap="md">
                  <Title order={3}>Display Preferences</Title>
                  <Text size="sm" c="dimmed">
                    Customize how dates and times are displayed throughout the
                    application
                  </Text>

                  <Radio.Group
                    label="Time Format"
                    description="Choose how times are displayed"
                    value={timeFormat}
                    onChange={(value) => setTimeFormat(value as TimeFormat)}
                  >
                    <Stack gap="sm" mt="xs">
                      <Radio
                        value="24h"
                        label="24 Hours"
                        description="Display times in 24 hours format (e.g., 14:30)"
                      />
                      <Radio
                        value="ampm"
                        label="12 Hours (AM/PM)"
                        description="Display times in 12 hours format with AM/PM (e.g., 2:30 PM)"
                      />
                    </Stack>
                  </Radio.Group>

                  <Radio.Group
                    label="Date Format"
                    description="Choose how dates are displayed"
                    value={dateFormat}
                    onChange={(value) => setDateFormat(value as DateFormat)}
                  >
                    <Stack gap="sm" mt="xs">
                      <Radio
                        value="eur"
                        label="EUR Format"
                        description="DD.MM.YYYY (e.g., 31.12.2023)"
                      />
                      <Radio
                        value="us"
                        label="US Format"
                        description="MM/DD/YYYY (e.g., 12/31/2023)"
                      />
                    </Stack>
                  </Radio.Group>
                </Stack>
              </Paper>

              {/* Library Link */}
              <Paper p="md" withBorder>
                <Stack gap="md">
                  <Title order={3}>Library Link</Title>
                  <Text size="sm" c="dimmed">
                    Add a link to your external library (e.g., BookLore,
                    Calibre-Web-Automated or other book management system)
                  </Text>

                  <TextInput
                    label="Library URL"
                    placeholder="https://booklore.example.com"
                    value={libraryUrl}
                    onChange={(e) => setLibraryUrl(e.target.value)}
                    description="Enter the full URL to your library"
                  />

                  <Radio.Group
                    label="Link Location"
                    description="Choose where to display the library link"
                    value={libraryLinkLocation}
                    onChange={(value) =>
                      setLibraryLinkLocation(value as LibraryLinkLocation)
                    }
                  >
                    <Stack gap="sm" mt="xs">
                      <Radio
                        value="sidebar"
                        label="Sidebar"
                        description="Display the link in the sidebar navigation"
                      />
                      <Radio
                        value="header"
                        label="Header"
                        description="Display the link in the header next to the theme toggle"
                      />
                      <Radio
                        value="both"
                        label="Sidebar & Header"
                        description="Display the link in both the sidebar and header"
                      />
                    </Stack>
                  </Radio.Group>
                </Stack>
              </Paper>

              {/* Cache */}
              <Paper p="md" withBorder>
                <Stack gap="md">
                  <Title order={3}>Cache</Title>
                  <Text size="sm" c="dimmed">
                    Configure cache retention settings
                  </Text>

                  <NumberInput
                    label="Book Cache Retention Period"
                    description="Number of days to keep book search and download cache before auto-deleting them (0 = never delete, cleanup runs daily)"
                    placeholder="30"
                    value={bookRetentionDays}
                    onChange={(value) =>
                      setBookRetentionDays(Number(value) || 0)
                    }
                    min={0}
                    max={365}
                    required
                  />
                </Stack>
              </Paper>

              <Group justify="flex-end">
                <Button
                  onClick={handleSaveApp}
                  disabled={!hasAppChanges}
                  loading={updateSettings.isPending}
                >
                  Save App Settings
                </Button>
              </Group>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="notifications" pt="lg">
            <Stack gap="lg">
              {/* Apprise Notifications */}
              <Paper p="md" withBorder>
                <Stack gap="md">
                  <Group justify="space-between">
                    <div>
                      <Title order={3}>
                        <Group gap="xs">Apprise Notifications</Group>
                      </Title>
                      <Text size="sm" c="dimmed">
                        Configure push notifications for download events via{" "}
                        <a
                          href="https://github.com/caronc/apprise"
                          target="_blank"
                          rel=" nofollow noreferrer noopener"
                        >
                          Apprise
                        </a>
                      </Text>
                    </div>
                    <Switch
                      checked={appriseEnabled}
                      onChange={(e) =>
                        setAppriseEnabled(e.currentTarget.checked)
                      }
                      label="Enabled"
                      size="lg"
                    />
                  </Group>

                  {appriseEnabled && (
                    <Stack gap="sm">
                      <TextInput
                        label="Apprise Server URL"
                        placeholder="http://apprise:8111/notify/apprise"
                        value={appriseServerUrl}
                        onChange={(e) => setAppriseServerUrl(e.target.value)}
                        description="Your Apprise API endpoint URL"
                        required
                      />

                      {/* Custom Headers */}
                      <Stack gap="xs">
                        <Group justify="space-between">
                          <Text size="sm" fw={500}>
                            Custom Headers (optional)
                          </Text>
                          <Button
                            size="xs"
                            variant="light"
                            leftSection={<IconPlus size={14} />}
                            onClick={() =>
                              setCustomHeaders([
                                ...customHeaders,
                                { key: "", value: "" },
                              ])
                            }
                          >
                            Add Header
                          </Button>
                        </Group>
                        {customHeaders.map((header, index) => (
                          <Group key={index} gap="xs">
                            <TextInput
                              placeholder="Header name"
                              value={header.key}
                              onChange={(e) => {
                                const newHeaders = [...customHeaders];
                                const current = newHeaders[index];
                                if (current) {
                                  current.key = e.target.value;
                                  setCustomHeaders(newHeaders);
                                }
                              }}
                              style={{ flex: 1 }}
                            />
                            <TextInput
                              placeholder="Header value"
                              value={header.value}
                              onChange={(e) => {
                                const newHeaders = [...customHeaders];
                                const current = newHeaders[index];
                                if (current) {
                                  current.value = e.target.value;
                                  setCustomHeaders(newHeaders);
                                }
                              }}
                              style={{ flex: 1 }}
                            />
                            <ActionIcon
                              color="red"
                              variant="light"
                              onClick={() => {
                                setCustomHeaders(
                                  customHeaders.filter((_, i) => i !== index),
                                );
                              }}
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Group>
                        ))}
                      </Stack>

                      {/* Notification Toggles */}
                      <Stack gap="xs" mt="md">
                        <Text size="sm" fw={500}>
                          Notification Events
                        </Text>
                        <Checkbox
                          label="New download request created"
                          checked={notifyOnNewRequest}
                          onChange={(e) =>
                            setNotifyOnNewRequest(e.currentTarget.checked)
                          }
                        />
                        <Checkbox
                          label="Download error (max retries reached)"
                          checked={notifyOnDownloadError}
                          onChange={(e) =>
                            setNotifyOnDownloadError(e.currentTarget.checked)
                          }
                        />
                        <Checkbox
                          label="Download available (moved to final destination)"
                          checked={notifyOnAvailable}
                          onChange={(e) =>
                            setNotifyOnAvailable(e.currentTarget.checked)
                          }
                        />
                        <Checkbox
                          label="Download delayed (quota exhausted)"
                          checked={notifyOnDelayed}
                          onChange={(e) =>
                            setNotifyOnDelayed(e.currentTarget.checked)
                          }
                        />
                        <Checkbox
                          label="Update available"
                          checked={notifyOnUpdateAvailable}
                          onChange={(e) =>
                            setNotifyOnUpdateAvailable(e.currentTarget.checked)
                          }
                        />
                        <Checkbox
                          label="Request fulfilled (automatic search found book)"
                          checked={notifyOnRequestFulfilled}
                          onChange={(e) =>
                            setNotifyOnRequestFulfilled(e.currentTarget.checked)
                          }
                        />
                        <Checkbox
                          label="Book queued for download"
                          checked={notifyOnBookQueued}
                          onChange={(e) =>
                            setNotifyOnBookQueued(e.currentTarget.checked)
                          }
                        />
                      </Stack>

                      <Group justify="flex-end" mt="md">
                        <Button
                          variant="outline"
                          leftSection={<IconBell size={16} />}
                          onClick={handleTestApprise}
                          loading={testApprise.isPending}
                          disabled={!appriseServerUrl}
                        >
                          Send Test Notification
                        </Button>
                        <Button
                          onClick={handleSaveApprise}
                          disabled={!hasAppriseChanges}
                          loading={updateApprise.isPending}
                        >
                          Save Settings
                        </Button>
                      </Group>
                    </Stack>
                  )}

                  {!appriseEnabled && (
                    <>
                      <Alert icon={<IconInfoCircle size={16} />} color="gray">
                        <Text size="sm">
                          Apprise notifications are currently disabled. Enable
                          them above to configure push notifications for
                          download events.
                        </Text>
                      </Alert>

                      {/* Show save button if user toggled Apprise off */}
                      {appriseSettings && appriseSettings.enabled && (
                        <Group justify="flex-end">
                          <Button
                            onClick={handleSaveApprise}
                            loading={updateApprise.isPending}
                          >
                            Save Settings
                          </Button>
                        </Group>
                      )}
                    </>
                  )}
                </Stack>
              </Paper>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="booklore" pt="lg">
            <Stack gap="lg">
              {/* Booklore Settings */}
              <Paper p="md" withBorder>
                <Stack gap="md">
                  <Group justify="space-between">
                    <div>
                      <Title order={3}>Booklore Integration</Title>
                      <Text size="sm" c="dimmed">
                        Configure automatic upload to your Booklore library
                      </Text>
                    </div>
                    <Switch
                      checked={bookloreEnabled}
                      onChange={(e) =>
                        setBookloreEnabled(e.currentTarget.checked)
                      }
                      label="Enabled"
                      size="lg"
                    />
                  </Group>

                  {/* Show save button if user toggled Booklore off (form is hidden but change needs saving) */}
                  {!bookloreEnabled &&
                    bookloreSettings &&
                    bookloreSettings.enabled && (
                      <Group justify="flex-end">
                        <Button
                          onClick={handleSaveBooklore}
                          loading={updateBooklore.isPending}
                        >
                          Disable Booklore
                        </Button>
                      </Group>
                    )}

                  {bookloreEnabled && (
                    <Stack gap="sm">
                      <TextInput
                        label="Base URL"
                        placeholder="http://192.168.7.3:6060"
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                        required
                      />

                      <NumberInput
                        label="Library ID"
                        placeholder="e.g., 1"
                        value={libraryId}
                        onChange={(value) => setLibraryId(value as number | "")}
                        min={1}
                        required
                      />

                      <NumberInput
                        label="Path ID"
                        placeholder="e.g., 1"
                        value={pathId}
                        onChange={(value) => setPathId(value as number | "")}
                        min={1}
                        required
                      />

                      {/* Show connection status if connected */}
                      {bookloreSettings?.connected && !showAuthForm && (
                        <Alert
                          icon={<IconPlugConnected size={16} />}
                          color="green"
                          mt="sm"
                        >
                          <Stack gap="xs">
                            <Text size="sm" fw={500}>
                              ✓ Connected to Booklore
                            </Text>
                            {bookloreSettings.accessTokenExpiresAt && (
                              <Text size="xs" c="dimmed">
                                Access token expires:{" "}
                                {formatDate(
                                  bookloreSettings.accessTokenExpiresAt,
                                  dateFormat,
                                  timeFormat,
                                )}
                              </Text>
                            )}
                            {bookloreSettings.refreshTokenExpiresAt && (
                              <Text size="xs" c="dimmed">
                                Refresh token expires:{" "}
                                {formatDate(
                                  bookloreSettings.refreshTokenExpiresAt,
                                  dateFormat,
                                  timeFormat,
                                )}
                              </Text>
                            )}
                            <Button
                              size="xs"
                              variant="light"
                              onClick={() => setShowAuthForm(true)}
                              mt="xs"
                            >
                              Re-authenticate
                            </Button>
                          </Stack>
                        </Alert>
                      )}

                      {/* Show authentication form when needed */}
                      {(showAuthForm || !bookloreSettings?.connected) && (
                        <Stack gap="sm">
                          <TextInput
                            label="Username"
                            placeholder="Enter your Booklore username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            description="Credentials are used for authentication only, never stored"
                            required
                          />

                          <PasswordInput
                            label="Password"
                            placeholder="Enter your Booklore password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                          />
                        </Stack>
                      )}

                      <Alert
                        icon={<IconInfoCircle size={16} />}
                        color="blue"
                        mt="sm"
                      >
                        <Text size="sm">
                          <strong>Note:</strong> When post-download action is
                          set to "Upload only" or "Move and Upload", files will
                          always be uploaded to Booklore automatically if it's
                          enabled and configured.
                        </Text>
                      </Alert>

                      <Group justify="space-between">
                        <Button
                          variant="outline"
                          leftSection={<IconPlugConnected size={16} />}
                          onClick={handleTestConnection}
                          loading={testConnection.isPending}
                          disabled={!bookloreSettings?.connected}
                        >
                          Test Connection
                        </Button>
                        <Button
                          onClick={handleSaveBooklore}
                          disabled={!hasBookloreChanges}
                          loading={updateBooklore.isPending}
                        >
                          {bookloreSettings?.connected
                            ? "Save Changes"
                            : "Save & Authenticate"}
                        </Button>
                      </Group>
                    </Stack>
                  )}

                  {!bookloreEnabled && (
                    <>
                      <Alert icon={<IconInfoCircle size={16} />} color="gray">
                        <Text size="sm">
                          Booklore integration is currently disabled. Enable it
                          above to configure automatic uploads.
                        </Text>
                      </Alert>

                      {/* Show clear auth button if tokens still exist while disabled */}
                      {bookloreSettings?.connected && (
                        <Alert
                          icon={<IconInfoCircle size={16} />}
                          color="yellow"
                        >
                          <Stack gap="xs">
                            <Text size="sm">
                              Authentication data is still stored. Clear it for
                              better security.
                            </Text>
                            <Button
                              size="xs"
                              variant="light"
                              color="red"
                              onClick={async () => {
                                await updateBooklore.mutateAsync({
                                  enabled: false,
                                });
                              }}
                              loading={updateBooklore.isPending}
                            >
                              Clear Authentication Data
                            </Button>
                          </Stack>
                        </Alert>
                      )}
                    </>
                  )}
                </Stack>
              </Paper>
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Container>
  );
}

export const Route = createFileRoute("/settings")({
  component: SettingsComponent,
  validateSearch: settingsSearchSchema,
});
