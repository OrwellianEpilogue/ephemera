import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { requireAuth } from "../lib/route-auth";
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
  Menu,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconInfoCircle,
  IconPlugConnected,
  IconBell,
  IconTrash,
  IconPlus,
  IconSettings,
  IconUpload,
  IconServer,
  IconUsers,
  IconMail,
  IconUser,
  IconUserShare,
  IconFolders,
} from "@tabler/icons-react";
import {
  useAppSettings,
  useUpdateAppSettings,
  useBookloreSettings,
  useUpdateBookloreSettings,
  useTestBookloreConnection,
  useBookloreLibraries,
  useAppriseSettings,
  useUpdateAppriseSettings,
  useTestAppriseNotification,
  useSystemConfig,
  useUpdateSystemConfig,
} from "../hooks/useSettings";
import { useState, useEffect } from "react";
import type {
  TimeFormat,
  DateFormat,
  RequestCheckInterval,
  LibraryLinkLocation,
  BookloreLibrary,
  BooklorePath,
} from "@ephemera/shared";
import { formatDate } from "@ephemera/shared";
import { z } from "zod";
import { IndexerSettings } from "../components/IndexerSettings";
import { useIndexerSettings } from "../hooks/use-indexer-settings";
import { useAuth, usePermissions } from "../hooks/useAuth";
import { lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@ephemera/shared";

// Minimal User type for reassignment dropdown
interface UserBasic {
  id: string;
  name: string;
  email: string;
}
import {
  useEmailSettings,
  useUpdateEmailSettings,
  useTestEmailConnection,
  useEmailRecipients,
  useAddEmailRecipient,
  useDeleteEmailRecipient,
  useUpdateEmailRecipient,
  useReassignEmailRecipient,
} from "../hooks/useEmail";

// Lazy load heavy components
const UsersManagement = lazy(() => import("../components/UsersManagement"));
const OIDCManagement = lazy(() => import("../components/OIDCManagement"));
const AccountSettings = lazy(() => import("../components/AccountSettings"));

const settingsSearchSchema = z.object({
  tab: z
    .enum([
      "account",
      "general",
      "system",
      "notifications",
      "booklore",
      "indexer",
      "users",
      "oidc",
      "email",
    ])
    .optional()
    .default("account"),
});

function SettingsComponent() {
  const navigate = useNavigate({ from: "/settings" });
  const { tab } = Route.useSearch();
  const { isAdmin } = useAuth();
  const { data: permissions, isLoading: loadingPermissions } = usePermissions();

  // Check granular permissions for each settings area
  const canConfigureApp = isAdmin || permissions?.canConfigureApp;
  const canConfigureIntegrations =
    isAdmin || permissions?.canConfigureIntegrations;
  const canConfigureNotifications =
    isAdmin || permissions?.canConfigureNotifications;
  const canConfigureEmail = isAdmin || permissions?.canConfigureEmail;

  // Define which tabs require which permissions
  const adminOnlyTabs = ["users", "oidc"];

  // Get permission for a specific tab
  const getTabPermission = (tabName: string): boolean => {
    switch (tabName) {
      case "general":
      case "system":
        return !!canConfigureApp;
      case "notifications":
        return !!canConfigureNotifications;
      case "booklore":
      case "indexer":
        return !!canConfigureIntegrations;
      case "email":
        return true; // All users can access email tab to manage their own recipients
      default:
        return false;
    }
  };

  // Redirect users who try to access tabs they don't have permission for
  useEffect(() => {
    if (loadingPermissions) return; // Wait for permissions to load

    const isAdminTab = adminOnlyTabs.includes(tab);

    // Redirect non-admins trying to access admin tabs
    if (isAdminTab && !isAdmin) {
      navigate({ search: { tab: "account" } });
      return;
    }

    // Redirect users without proper permission trying to access settings tabs
    if (!isAdminTab && tab !== "account" && !getTabPermission(tab)) {
      navigate({ search: { tab: "account" } });
      return;
    }
  }, [tab, isAdmin, loadingPermissions, navigate, permissions]);

  // Only fetch settings data if user has the specific permission
  const {
    data: settings,
    isLoading: loadingApp,
    isError: errorApp,
  } = useAppSettings({ enabled: canConfigureApp });
  const {
    data: bookloreSettings,
    isLoading: loadingBooklore,
    isError: errorBooklore,
  } = useBookloreSettings({ enabled: canConfigureIntegrations });
  const {
    data: appriseSettings,
    isLoading: loadingApprise,
    isError: errorApprise,
  } = useAppriseSettings({ enabled: canConfigureNotifications });
  const { data: indexerSettings } = useIndexerSettings({
    enabled: canConfigureIntegrations,
  });
  const {
    data: systemConfig,
    isLoading: loadingSystemConfig,
    isError: errorSystemConfig,
  } = useSystemConfig({ enabled: canConfigureApp });
  // Email settings - all users can read to check if enabled
  const {
    data: emailSettings,
    isLoading: loadingEmail,
    isError: errorEmail,
  } = useEmailSettings();
  // Email recipients - all users can manage their own, admins see all
  const { data: emailRecipients } = useEmailRecipients();
  // Check if email is properly configured (enabled with SMTP settings)
  const isEmailConfigured = emailSettings?.enabled && emailSettings?.smtpHost;
  const updateSettings = useUpdateAppSettings();
  const updateBooklore = useUpdateBookloreSettings();
  const updateApprise = useUpdateAppriseSettings();
  const updateSystemConfig = useUpdateSystemConfig();
  const testConnection = useTestBookloreConnection();
  const testApprise = useTestAppriseNotification();
  const updateEmail = useUpdateEmailSettings();
  const testEmail = useTestEmailConnection();
  const addRecipient = useAddEmailRecipient();
  const deleteRecipient = useDeleteEmailRecipient();
  const updateRecipient = useUpdateEmailRecipient();
  const reassignRecipient = useReassignEmailRecipient();

  // Fetch users list for admin reassignment
  const { data: allUsers } = useQuery({
    queryKey: ["users"],
    queryFn: () => apiFetch<UserBasic[]>("/users"),
    enabled: isAdmin,
  });

  // Fetch libraries after authentication
  const { data: librariesData, isLoading: loadingLibraries } =
    useBookloreLibraries(!!bookloreSettings?.connected);

  // App settings state - Post-download checkboxes
  const [postDownloadMoveToIngest, setPostDownloadMoveToIngest] =
    useState<boolean>(true);
  const [postDownloadUploadToBooklore, setPostDownloadUploadToBooklore] =
    useState<boolean>(false);
  const [postDownloadMoveToIndexer, setPostDownloadMoveToIndexer] =
    useState<boolean>(false);
  const [postDownloadDeleteTemp, setPostDownloadDeleteTemp] =
    useState<boolean>(true);

  const [bookRetentionDays, setBookRetentionDays] = useState<number>(30);
  const [bookSearchCacheDays, setUndownloadedBookRetentionDays] =
    useState<number>(7);
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

  // Email settings state
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [senderName, setSenderName] = useState("");
  const [useTls, setUseTls] = useState(true);
  const [newRecipientEmail, setNewRecipientEmail] = useState("");
  const [newRecipientName, setNewRecipientName] = useState("");

  // System configuration state
  const [downloadFolder, setDownloadFolder] = useState("./downloads");
  const [ingestFolder, setIngestFolder] = useState("/path/to/final/books");
  const [retryAttempts, setRetryAttempts] = useState(3);
  const [requestTimeout, setRequestTimeout] = useState(30000);
  const [searchCacheTtl, setSearchCacheTtl] = useState(300);
  const [maxConcurrentDownloads, setMaxConcurrentDownloads] = useState(1);

  // Sync with fetched settings
  useEffect(() => {
    if (settings) {
      // If Booklore is not connected and user has upload-related action selected,
      // reset to move_only
      // Load checkbox states
      setPostDownloadMoveToIngest(settings.postDownloadMoveToIngest ?? true);
      setPostDownloadUploadToBooklore(
        bookloreSettings?.connected
          ? (settings.postDownloadUploadToBooklore ?? false)
          : false,
      );
      setPostDownloadMoveToIndexer(settings.postDownloadMoveToIndexer ?? false);
      setPostDownloadDeleteTemp(settings.postDownloadDeleteTemp ?? true);
      setBookRetentionDays(settings.bookRetentionDays);
      setUndownloadedBookRetentionDays(settings.bookSearchCacheDays);
      setRequestCheckInterval(settings.requestCheckInterval);
      setTimeFormat(settings.timeFormat);
      setDateFormat(settings.dateFormat);
      setLibraryUrl(settings.libraryUrl || "");
      setLibraryLinkLocation(settings.libraryLinkLocation);
    }
  }, [settings, bookloreSettings?.connected]);

  // Automatically uncheck "Move to Indexer Directory" when indexers are disabled
  useEffect(() => {
    if (
      indexerSettings &&
      !indexerSettings.newznabEnabled &&
      !indexerSettings.sabnzbdEnabled
    ) {
      // If indexers are disabled, uncheck the move to indexer directory option
      if (postDownloadMoveToIndexer) {
        setPostDownloadMoveToIndexer(false);
        // Also save this change to the backend
        updateSettings.mutate({
          postDownloadMoveToIndexer: false,
        });
      }
    }
  }, [indexerSettings?.newznabEnabled, indexerSettings?.sabnzbdEnabled]);

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

  // Invalidate libraries query when authentication changes to refetch
  useEffect(() => {
    if (bookloreSettings?.connected && !librariesData) {
      // Libraries will be fetched automatically by the hook
    }
  }, [bookloreSettings?.connected, librariesData]);

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

  useEffect(() => {
    if (emailSettings) {
      setEmailEnabled(emailSettings.enabled);
      setSmtpHost(emailSettings.smtpHost || "");
      setSmtpPort(emailSettings.smtpPort || 587);
      setSmtpUser(emailSettings.smtpUser || "");
      setSmtpPassword(emailSettings.smtpPassword || "");
      setSenderEmail(emailSettings.senderEmail || "");
      setSenderName(emailSettings.senderName || "");
      setUseTls(emailSettings.useTls);
    }
  }, [emailSettings]);

  // Sync with system configuration
  useEffect(() => {
    if (systemConfig) {
      setDownloadFolder(systemConfig.downloadFolder);
      setIngestFolder(systemConfig.ingestFolder);
      setRetryAttempts(systemConfig.retryAttempts);
      setRequestTimeout(systemConfig.requestTimeout);
      setSearchCacheTtl(systemConfig.searchCacheTtl);
      setMaxConcurrentDownloads(systemConfig.maxConcurrentDownloads);
    }
  }, [systemConfig]);

  const handleSaveApp = () => {
    updateSettings.mutate({
      postDownloadMoveToIngest,
      postDownloadUploadToBooklore,
      postDownloadMoveToIndexer,
      postDownloadDeleteTemp,
      bookRetentionDays,
      bookSearchCacheDays,
      requestCheckInterval,
      timeFormat,
      dateFormat,
      libraryUrl: libraryUrl || null,
      libraryLinkLocation,
    });
  };

  const handleSaveSystemConfig = () => {
    updateSystemConfig.mutate({
      downloadFolder,
      ingestFolder,
      retryAttempts,
      requestTimeout,
      searchCacheTtl,
      maxConcurrentDownloads,
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

  const handleSaveEmail = () => {
    updateEmail.mutate({
      enabled: emailEnabled,
      smtpHost: smtpHost || null,
      smtpPort,
      smtpUser: smtpUser || null,
      smtpPassword: smtpPassword || null,
      senderEmail: senderEmail || null,
      senderName: senderName || null,
      useTls,
    });
  };

  const handleTestEmail = () => {
    // Validate required fields before testing
    if (!smtpHost) {
      notifications.show({
        title: "Missing Configuration",
        message: "Please enter SMTP host",
        color: "red",
      });
      return;
    }
    if (!senderEmail) {
      notifications.show({
        title: "Missing Configuration",
        message: "Please enter sender email",
        color: "red",
      });
      return;
    }

    // Pass current form values to test connection
    testEmail.mutate({
      smtpHost,
      smtpPort,
      smtpUser: smtpUser || null,
      smtpPassword: smtpPassword || null,
      senderEmail,
      useTls,
    });
  };

  const handleAddRecipient = () => {
    if (newRecipientEmail) {
      addRecipient.mutate({
        email: newRecipientEmail,
        name: newRecipientName || null,
        autoSend: false,
      });
      setNewRecipientEmail("");
      setNewRecipientName("");
    }
  };

  const hasAppChanges =
    settings &&
    (settings.postDownloadMoveToIngest !== postDownloadMoveToIngest ||
      settings.postDownloadUploadToBooklore !== postDownloadUploadToBooklore ||
      settings.postDownloadMoveToIndexer !== postDownloadMoveToIndexer ||
      settings.postDownloadDeleteTemp !== postDownloadDeleteTemp ||
      settings.bookRetentionDays !== bookRetentionDays ||
      settings.bookSearchCacheDays !== bookSearchCacheDays ||
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
    : // New setup: enable save button for initial authentication
      bookloreEnabled && baseUrl !== "" && username !== "" && password !== "";

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

  const hasEmailChanges = emailSettings
    ? emailSettings.enabled !== emailEnabled ||
      (emailSettings.smtpHost || "") !== smtpHost ||
      emailSettings.smtpPort !== smtpPort ||
      (emailSettings.smtpUser || "") !== smtpUser ||
      (emailSettings.smtpPassword || "") !== smtpPassword ||
      (emailSettings.senderEmail || "") !== senderEmail ||
      (emailSettings.senderName || "") !== senderName ||
      emailSettings.useTls !== useTls
    : emailEnabled; // Allow save if no settings exist yet and email is enabled

  // Loading state only matters for non-Account tabs when user has relevant permissions
  const isSettingsLoading =
    (canConfigureApp && loadingApp) ||
    (canConfigureIntegrations && loadingBooklore) ||
    (canConfigureNotifications && loadingApprise) ||
    (canConfigureEmail && loadingEmail);
  const isSettingsError =
    (canConfigureApp && errorApp) ||
    (canConfigureIntegrations && errorBooklore) ||
    (canConfigureNotifications && errorApprise) ||
    (canConfigureEmail && errorEmail);

  // For Account tab, don't block on settings loading/error
  // For other tabs, show loading/error states if user has access
  if (tab !== "account" && loadingPermissions) {
    return (
      <Container size="md">
        <Center p="xl">
          <Loader size="lg" />
        </Center>
      </Container>
    );
  }

  if (tab !== "account" && isSettingsLoading) {
    return (
      <Container size="md">
        <Center p="xl">
          <Loader size="lg" />
        </Center>
      </Container>
    );
  }

  if (tab !== "account" && isSettingsError) {
    return (
      <Container size="md">
        <Alert icon={<IconInfoCircle size={16} />} title="Error" color="red">
          Failed to load settings. Please try again.
        </Alert>
      </Container>
    );
  }

  return (
    <Container fluid>
      <Stack gap="lg">
        <Title order={1}>Settings</Title>

        <Tabs
          value={tab}
          orientation="vertical"
          onChange={(value) =>
            navigate({
              search: {
                tab: value as
                  | "account"
                  | "general"
                  | "notifications"
                  | "booklore"
                  | "indexer"
                  | "users"
                  | "oidc",
              },
            })
          }
        >
          <Tabs.List miw={160}>
            <Tabs.Tab value="account" leftSection={<IconUser size={16} />}>
              Account
            </Tabs.Tab>
            {canConfigureApp && (
              <>
                <Tabs.Tab
                  value="general"
                  leftSection={<IconSettings size={16} />}
                >
                  General
                </Tabs.Tab>
                <Tabs.Tab
                  value="system"
                  leftSection={<IconFolders size={16} />}
                >
                  System
                </Tabs.Tab>
              </>
            )}
            {canConfigureNotifications && (
              <Tabs.Tab
                value="notifications"
                leftSection={<IconBell size={16} />}
              >
                Notifications
              </Tabs.Tab>
            )}
            {canConfigureIntegrations && (
              <>
                <Tabs.Tab
                  value="booklore"
                  leftSection={<IconUpload size={16} />}
                >
                  Booklore
                </Tabs.Tab>
                <Tabs.Tab
                  value="indexer"
                  leftSection={<IconServer size={16} />}
                >
                  Indexer
                </Tabs.Tab>
              </>
            )}
            {/* Email tab accessible to all users for managing their own recipients */}
            <Tabs.Tab value="email" leftSection={<IconMail size={16} />}>
              Email
            </Tabs.Tab>
            {isAdmin && (
              <>
                <Tabs.Tab value="users" leftSection={<IconUsers size={16} />}>
                  Users
                </Tabs.Tab>
                <Tabs.Tab
                  value="oidc"
                  leftSection={<IconPlugConnected size={16} />}
                >
                  OIDC
                </Tabs.Tab>
              </>
            )}
          </Tabs.List>

          {/* Account Tab - Available to all authenticated users */}
          <Tabs.Panel value="account" pl="xl">
            <Suspense
              fallback={
                <Center p="xl">
                  <Loader size="lg" />
                </Center>
              }
            >
              <AccountSettings />
            </Suspense>
          </Tabs.Panel>

          <Tabs.Panel value="general" pl="xl">
            <Stack gap="lg">
              {/* Post-Download Actions */}
              <Paper p="md" withBorder>
                <Stack gap="md">
                  <Title order={3}>Post-Download Actions</Title>
                  <Text size="sm" c="dimmed">
                    Configure what happens after a book is successfully
                    downloaded
                  </Text>

                  <Stack gap="md">
                    <Checkbox
                      checked={postDownloadMoveToIngest}
                      onChange={(event) =>
                        setPostDownloadMoveToIngest(event.currentTarget.checked)
                      }
                      label="Move to Ingest"
                      description="Move downloaded files to your configured ingest folder"
                    />

                    <Checkbox
                      checked={postDownloadUploadToBooklore}
                      onChange={(event) =>
                        setPostDownloadUploadToBooklore(
                          event.currentTarget.checked,
                        )
                      }
                      label="Upload to Booklore"
                      description="Upload to Booklore library (requires Booklore configuration)"
                      disabled={
                        !bookloreSettings?.enabled ||
                        !bookloreSettings?.connected
                      }
                    />

                    <Checkbox
                      checked={postDownloadMoveToIndexer}
                      onChange={(event) =>
                        setPostDownloadMoveToIndexer(
                          event.currentTarget.checked,
                        )
                      }
                      label="Move to Indexer Directory"
                      description="Move to separate directory for indexer downloads (SABnzbd/Readarr)"
                      disabled={
                        !indexerSettings?.newznabEnabled &&
                        !indexerSettings?.sabnzbdEnabled
                      }
                    />

                    <Checkbox
                      checked={postDownloadDeleteTemp}
                      onChange={(event) =>
                        setPostDownloadDeleteTemp(event.currentTarget.checked)
                      }
                      label="Delete Temporary Files"
                      description="Remove temporary download files after processing"
                    />
                  </Stack>

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

                  <NumberInput
                    label="Book Search Cache Days"
                    description="Number of days to keep books from search results in cache before auto-deleting them (0 = never delete, cleanup runs daily)"
                    placeholder="7"
                    value={bookSearchCacheDays}
                    onChange={(value) =>
                      setUndownloadedBookRetentionDays(Number(value) || 0)
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

          <Tabs.Panel value="system" pl="xl">
            <Stack gap="lg">
              {loadingSystemConfig ? (
                <Center py="xl">
                  <Loader />
                </Center>
              ) : errorSystemConfig ? (
                <Alert color="red" title="Error">
                  Failed to load system configuration
                </Alert>
              ) : (
                <>
                  {/* Folder Paths */}
                  <Paper p="md" withBorder>
                    <Stack gap="md">
                      <Title order={3}>Folder Paths</Title>
                      <Text size="sm" c="dimmed">
                        Configure where downloaded files are stored
                      </Text>

                      <TextInput
                        label="Download Folder"
                        description="Temporary folder for downloads in progress"
                        value={downloadFolder}
                        onChange={(e) => setDownloadFolder(e.target.value)}
                        placeholder="./downloads"
                      />

                      <TextInput
                        label="Ingest Folder"
                        description="Final destination for completed downloads"
                        value={ingestFolder}
                        onChange={(e) => setIngestFolder(e.target.value)}
                        placeholder="/path/to/final/books"
                      />
                    </Stack>
                  </Paper>

                  {/* Download Settings */}
                  <Paper p="md" withBorder>
                    <Stack gap="md">
                      <Title order={3}>Download Settings</Title>
                      <Text size="sm" c="dimmed">
                        Configure download behavior and retry settings
                      </Text>

                      <NumberInput
                        label="Max Concurrent Downloads"
                        description="Maximum number of downloads that can run simultaneously (1-5)"
                        value={maxConcurrentDownloads}
                        onChange={(val) =>
                          setMaxConcurrentDownloads(Number(val) || 1)
                        }
                        min={1}
                        max={5}
                      />

                      <NumberInput
                        label="Retry Attempts"
                        description="Number of times to retry a failed download (1-10)"
                        value={retryAttempts}
                        onChange={(val) => setRetryAttempts(Number(val) || 3)}
                        min={1}
                        max={10}
                      />

                      <NumberInput
                        label="Request Timeout (ms)"
                        description="Timeout for API requests in milliseconds (5000-300000)"
                        value={requestTimeout}
                        onChange={(val) =>
                          setRequestTimeout(Number(val) || 30000)
                        }
                        min={5000}
                        max={300000}
                        step={1000}
                      />

                      <NumberInput
                        label="Search Cache TTL (seconds)"
                        description="How long to cache search results (60-86400)"
                        value={searchCacheTtl}
                        onChange={(val) =>
                          setSearchCacheTtl(Number(val) || 300)
                        }
                        min={60}
                        max={86400}
                        step={60}
                      />
                    </Stack>
                  </Paper>

                  {/* Save Button */}
                  <Group justify="flex-end">
                    <Button
                      onClick={handleSaveSystemConfig}
                      loading={updateSystemConfig.isPending}
                    >
                      Save System Configuration
                    </Button>
                  </Group>
                </>
              )}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="notifications" pl="xl">
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

          <Tabs.Panel value="booklore" pl="xl">
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

                      {/* Show library/path dropdowns only after authentication */}
                      {bookloreSettings?.connected && librariesData ? (
                        <>
                          <Select
                            label="Library"
                            placeholder="Select a library"
                            value={libraryId ? String(libraryId) : null}
                            onChange={(value) =>
                              setLibraryId(value ? Number(value) : "")
                            }
                            data={librariesData.libraries.map(
                              (lib: BookloreLibrary) => ({
                                value: String(lib.id),
                                label: lib.name,
                              }),
                            )}
                            disabled={loadingLibraries}
                            required
                          />

                          <Select
                            label="Path"
                            placeholder="Select a path"
                            value={pathId ? String(pathId) : null}
                            onChange={(value) =>
                              setPathId(value ? Number(value) : "")
                            }
                            data={
                              libraryId
                                ? librariesData.libraries
                                    .find(
                                      (lib: BookloreLibrary) =>
                                        lib.id === libraryId,
                                    )
                                    ?.paths.map((p: BooklorePath) => ({
                                      value: String(p.id),
                                      label: p.path,
                                    })) || []
                                : []
                            }
                            disabled={!libraryId || loadingLibraries}
                            required
                          />
                        </>
                      ) : bookloreSettings?.connected && loadingLibraries ? (
                        <Alert icon={<IconInfoCircle size={16} />} color="blue">
                          <Text size="sm">Loading libraries...</Text>
                        </Alert>
                      ) : null}

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
                          {!bookloreSettings?.connected && username && password
                            ? "Authenticate"
                            : bookloreSettings?.connected &&
                                (libraryId || pathId)
                              ? "Save Library Settings"
                              : "Save Changes"}
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

          <Tabs.Panel value="indexer" pl="xl">
            <IndexerSettings />
          </Tabs.Panel>

          <Tabs.Panel value="email" pl="xl">
            <Stack gap="lg">
              {/* SMTP Settings - Only for users with canConfigureEmail permission */}
              {canConfigureEmail && (
                <Paper p="md" withBorder>
                  <Stack gap="md">
                    <Group justify="space-between">
                      <div>
                        <Title order={3}>Email Settings</Title>
                        <Text size="sm" c="dimmed">
                          Configure SMTP settings to send books via email
                        </Text>
                      </div>
                      <Switch
                        checked={emailEnabled}
                        onChange={(e) =>
                          setEmailEnabled(e.currentTarget.checked)
                        }
                        label="Enabled"
                        size="lg"
                      />
                    </Group>

                    {emailEnabled && (
                      <Stack gap="sm">
                        <TextInput
                          label="SMTP Host"
                          placeholder="smtp.gmail.com"
                          value={smtpHost}
                          onChange={(e) => setSmtpHost(e.target.value)}
                          required
                        />
                        <NumberInput
                          label="SMTP Port"
                          value={smtpPort}
                          onChange={(val) => setSmtpPort(Number(val) || 587)}
                          min={1}
                          max={65535}
                        />
                        <TextInput
                          label="SMTP Username"
                          placeholder="user@gmail.com"
                          value={smtpUser}
                          onChange={(e) => setSmtpUser(e.target.value)}
                        />
                        <PasswordInput
                          label="SMTP Password"
                          placeholder="Your SMTP password or app password"
                          value={smtpPassword}
                          onChange={(e) => setSmtpPassword(e.target.value)}
                        />
                        <TextInput
                          label="Sender Email"
                          placeholder="books@example.com"
                          value={senderEmail}
                          onChange={(e) => setSenderEmail(e.target.value)}
                          required
                        />
                        <TextInput
                          label="Sender Name"
                          placeholder="Book Library"
                          value={senderName}
                          onChange={(e) => setSenderName(e.target.value)}
                        />
                        <Switch
                          checked={useTls}
                          onChange={(e) => setUseTls(e.currentTarget.checked)}
                          label="Use TLS/STARTTLS"
                        />

                        <Group justify="flex-end" mt="md">
                          <Button
                            variant="outline"
                            onClick={handleTestEmail}
                            loading={testEmail.isPending}
                            disabled={!smtpHost || !senderEmail}
                          >
                            Test Connection
                          </Button>
                          <Button
                            onClick={handleSaveEmail}
                            disabled={!hasEmailChanges}
                            loading={updateEmail.isPending}
                          >
                            Save Settings
                          </Button>
                        </Group>
                      </Stack>
                    )}

                    {!emailEnabled && (
                      <>
                        <Alert icon={<IconInfoCircle size={16} />} color="gray">
                          <Text size="sm">
                            Email sending is currently disabled. Enable it above
                            to configure SMTP settings.
                          </Text>
                        </Alert>

                        {/* Show save button if user toggled email off */}
                        {emailSettings && emailSettings.enabled && (
                          <Group justify="flex-end">
                            <Button
                              onClick={handleSaveEmail}
                              loading={updateEmail.isPending}
                            >
                              Save Settings
                            </Button>
                          </Group>
                        )}
                      </>
                    )}
                  </Stack>
                </Paper>
              )}

              {/* Email Recipients - All users can manage their own recipients */}
              <Paper p="md" withBorder>
                <Stack gap="md">
                  <div>
                    <Title order={3}>Email Recipients</Title>
                    <Text size="sm" c="dimmed">
                      {isAdmin
                        ? "Manage email addresses for all users"
                        : "Manage your email addresses for sending books"}
                    </Text>
                  </div>

                  {/* Show notice if email is not configured */}
                  {!isEmailConfigured && (
                    <Alert icon={<IconInfoCircle size={16} />} color="yellow">
                      <Text size="sm">
                        Email sending is not configured yet.{" "}
                        {canConfigureEmail
                          ? "Enable email in the settings above to add recipients."
                          : "An administrator needs to configure SMTP settings before you can add email recipients."}
                      </Text>
                    </Alert>
                  )}

                  {/* Only show form when email is configured */}
                  {isEmailConfigured && (
                    <>
                      <Group gap="xs">
                        <TextInput
                          placeholder="recipient@example.com"
                          value={newRecipientEmail}
                          onChange={(e) => setNewRecipientEmail(e.target.value)}
                          style={{ flex: 2 }}
                        />
                        <TextInput
                          placeholder="Name (optional)"
                          value={newRecipientName}
                          onChange={(e) => setNewRecipientName(e.target.value)}
                          style={{ flex: 1 }}
                        />
                        <Button
                          leftSection={<IconPlus size={14} />}
                          onClick={handleAddRecipient}
                          loading={addRecipient.isPending}
                          disabled={!newRecipientEmail}
                        >
                          Add
                        </Button>
                      </Group>

                      {emailRecipients && emailRecipients.length > 0 && (
                        <Stack gap="xs">
                          {emailRecipients.map((recipient) => (
                            <Group key={recipient.id} justify="space-between">
                              <Stack gap={0}>
                                <Group gap="xs">
                                  {recipient.name && (
                                    <Text size="sm" fw={500}>
                                      {recipient.name}
                                    </Text>
                                  )}
                                  {/* Show owner for admins */}
                                  {isAdmin && recipient.userName && (
                                    <Text size="xs" c="dimmed">
                                      ({recipient.userName})
                                    </Text>
                                  )}
                                </Group>
                                <Text
                                  size="sm"
                                  c={recipient.name ? "dimmed" : undefined}
                                >
                                  {recipient.email}
                                </Text>
                              </Stack>
                              <Group gap="sm">
                                <Switch
                                  size="xs"
                                  label="Auto-send"
                                  checked={recipient.autoSend}
                                  onChange={(e) =>
                                    updateRecipient.mutate({
                                      id: recipient.id,
                                      autoSend: e.currentTarget.checked,
                                    })
                                  }
                                />
                                {/* Reassign menu for admins */}
                                {isAdmin && allUsers && allUsers.length > 1 && (
                                  <Menu shadow="md" width={200}>
                                    <Menu.Target>
                                      <Tooltip label="Reassign to user">
                                        <ActionIcon
                                          color="blue"
                                          variant="light"
                                          loading={reassignRecipient.isPending}
                                        >
                                          <IconUserShare size={16} />
                                        </ActionIcon>
                                      </Tooltip>
                                    </Menu.Target>
                                    <Menu.Dropdown>
                                      <Menu.Label>Reassign to:</Menu.Label>
                                      {allUsers
                                        .filter(
                                          (u) => u.id !== recipient.userId,
                                        )
                                        .map((u) => (
                                          <Menu.Item
                                            key={u.id}
                                            onClick={() =>
                                              reassignRecipient.mutate({
                                                recipientId: recipient.id,
                                                userId: u.id,
                                              })
                                            }
                                          >
                                            {u.name || u.email}
                                          </Menu.Item>
                                        ))}
                                    </Menu.Dropdown>
                                  </Menu>
                                )}
                                <ActionIcon
                                  color="red"
                                  variant="light"
                                  onClick={() =>
                                    deleteRecipient.mutate(recipient.id)
                                  }
                                  loading={deleteRecipient.isPending}
                                >
                                  <IconTrash size={16} />
                                </ActionIcon>
                              </Group>
                            </Group>
                          ))}
                        </Stack>
                      )}

                      {(!emailRecipients || emailRecipients.length === 0) && (
                        <Text size="sm" c="dimmed" fs="italic">
                          No recipients added yet
                        </Text>
                      )}
                    </>
                  )}
                </Stack>
              </Paper>
            </Stack>
          </Tabs.Panel>

          {isAdmin && (
            <>
              <Tabs.Panel value="users" pl="xl">
                <Suspense
                  fallback={
                    <Center p="xl">
                      <Loader size="lg" />
                    </Center>
                  }
                >
                  <UsersManagement />
                </Suspense>
              </Tabs.Panel>

              <Tabs.Panel value="oidc" pl="xl">
                <Suspense
                  fallback={
                    <Center p="xl">
                      <Loader size="lg" />
                    </Center>
                  }
                >
                  <OIDCManagement />
                </Suspense>
              </Tabs.Panel>
            </>
          )}
        </Tabs>
      </Stack>
    </Container>
  );
}

export const Route = createFileRoute("/settings")({
  beforeLoad: async () => {
    await requireAuth();
  },
  component: SettingsComponent,
  validateSearch: settingsSearchSchema,
});
