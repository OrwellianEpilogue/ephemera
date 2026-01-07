import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { requireAuth } from "../lib/route-auth";
import { usePageTitle } from "../hooks/use-page-title";
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
  IconUserShare,
  IconShieldCheck,
  IconAlertTriangle,
  IconCloud,
  IconList,
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
import { useFrontendConfig } from "../hooks/useConfig";
import { useState, useEffect } from "react";
import { useTranslation, Trans } from "react-i18next";
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
const ProxyAuthSettings = lazy(() => import("../components/ProxyAuthSettings"));
const TolinoSettings = lazy(() => import("../components/TolinoSettings"));
const ListsSettings = lazy(() => import("../components/ListsSettings"));

const settingsSearchSchema = z.object({
  tab: z
    .enum([
      "general",
      "users",
      "lists",
      "notifications",
      "email",
      "oidc",
      "proxy-auth",
      "booklore",
      "indexer",
      "tolino",
    ])
    .catch("general"),
});

function SettingsComponent() {
  const { t } = useTranslation("translation", {
    keyPrefix: "settings",
  });
  // Use non-prefixed t for common translations
  const { t: tCommon } = useTranslation("translation", {
    keyPrefix: "common",
  });
  usePageTitle(t("title"));
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
  const canConfigureTolino = isAdmin || permissions?.canConfigureTolino;

  // Define which tabs require which permissions
  const adminOnlyTabs = ["users", "oidc", "proxy-auth", "lists"];

  // Get permission for a specific tab
  const getTabPermission = (tabName: string): boolean => {
    switch (tabName) {
      case "general":
        return !!canConfigureApp;
      case "notifications":
        return !!canConfigureNotifications;
      case "booklore":
      case "indexer":
        return !!canConfigureIntegrations;
      case "email":
        return true; // All users can access email tab to manage their own recipients
      case "tolino":
        return !!canConfigureTolino;
      default:
        return false;
    }
  };

  // Find the first tab the user has permission to access
  const getDefaultTab = (): string => {
    if (isAdmin) return "general";
    if (canConfigureApp) return "general";
    if (canConfigureNotifications) return "notifications";
    // Email is always accessible
    return "email";
  };

  // Redirect users who try to access tabs they don't have permission for
  useEffect(() => {
    if (loadingPermissions) return; // Wait for permissions to load

    const isAdminTab = adminOnlyTabs.includes(tab);

    // Redirect non-admins trying to access admin tabs
    if (isAdminTab && !isAdmin) {
      navigate({ search: { tab: getDefaultTab() } });
      return;
    }

    // Redirect users without proper permission trying to access settings tabs
    if (!isAdminTab && !getTabPermission(tab)) {
      navigate({ search: { tab: getDefaultTab() } });
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
  const { data: systemConfig } = useSystemConfig({ enabled: canConfigureApp });
  // Frontend config - safe values for all authenticated users (e.g., keepInDownloads for Tolino)
  const { data: frontendConfig } = useFrontendConfig();
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
  const [postDownloadKeepInDownloads, setPostDownloadKeepInDownloads] =
    useState<boolean>(false);
  const [postDownloadNormalizeEpub, setPostDownloadNormalizeEpub] =
    useState<boolean>(true);
  const [postDownloadConvertFormat, setPostDownloadConvertFormat] = useState<
    "epub" | "pdf" | "mobi" | "azw3" | null
  >(null);

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
  const [notifyOnRequestPendingApproval, setNotifyOnRequestPendingApproval] =
    useState(true);
  const [notifyOnRequestApproved, setNotifyOnRequestApproved] = useState(true);
  const [notifyOnRequestRejected, setNotifyOnRequestRejected] = useState(true);
  const [notifyOnListCreated, setNotifyOnListCreated] = useState(true);
  const [notifyOnTolinoConfigured, setNotifyOnTolinoConfigured] =
    useState(true);
  const [notifyOnEmailRecipientAdded, setNotifyOnEmailRecipientAdded] =
    useState(true);
  const [notifyOnOidcAccountCreated, setNotifyOnOidcAccountCreated] =
    useState(true);
  const [notifyOnOidcRoleUpdated, setNotifyOnOidcRoleUpdated] = useState(true);
  const [notifyOnServiceUnhealthy, setNotifyOnServiceUnhealthy] =
    useState(true);
  const [notifyOnServiceRecovered, setNotifyOnServiceRecovered] =
    useState(true);
  const [notifyOnEmailSent, setNotifyOnEmailSent] = useState(false);
  const [notifyOnTolinoUploaded, setNotifyOnTolinoUploaded] = useState(false);

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
  const [searcherBaseUrl, setSearcherBaseUrl] = useState("");
  const [searcherApiKey, setSearcherApiKey] = useState("");
  const [quickBaseUrl, setQuickBaseUrl] = useState("");
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
      setPostDownloadKeepInDownloads(
        settings.postDownloadKeepInDownloads ?? false,
      );
      setPostDownloadNormalizeEpub(settings.postDownloadNormalizeEpub ?? true);
      setPostDownloadConvertFormat(settings.postDownloadConvertFormat ?? null);
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
      setNotifyOnRequestPendingApproval(
        appriseSettings.notifyOnRequestPendingApproval,
      );
      setNotifyOnRequestApproved(appriseSettings.notifyOnRequestApproved);
      setNotifyOnRequestRejected(appriseSettings.notifyOnRequestRejected);
      setNotifyOnListCreated(appriseSettings.notifyOnListCreated);
      setNotifyOnTolinoConfigured(appriseSettings.notifyOnTolinoConfigured);
      setNotifyOnEmailRecipientAdded(
        appriseSettings.notifyOnEmailRecipientAdded,
      );
      setNotifyOnOidcAccountCreated(appriseSettings.notifyOnOidcAccountCreated);
      setNotifyOnOidcRoleUpdated(appriseSettings.notifyOnOidcRoleUpdated);
      setNotifyOnServiceUnhealthy(appriseSettings.notifyOnServiceUnhealthy);
      setNotifyOnServiceRecovered(appriseSettings.notifyOnServiceRecovered);
      setNotifyOnEmailSent(appriseSettings.notifyOnEmailSent);
      setNotifyOnTolinoUploaded(appriseSettings.notifyOnTolinoUploaded);
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
      setSearcherBaseUrl(systemConfig.searcherBaseUrl || "");
      setSearcherApiKey(systemConfig.searcherApiKey || "");
      setQuickBaseUrl(systemConfig.quickBaseUrl || "");
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
      postDownloadKeepInDownloads,
      postDownloadNormalizeEpub,
      postDownloadConvertFormat: postDownloadConvertFormat || null,
      bookRetentionDays,
      bookSearchCacheDays,
      requestCheckInterval,
      timeFormat,
      dateFormat,
      libraryUrl: libraryUrl || null,
      libraryLinkLocation,
    });
    updateSystemConfig.mutate({
      searcherBaseUrl: searcherBaseUrl || null,
      searcherApiKey: searcherApiKey || null,
      quickBaseUrl: quickBaseUrl || null,
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
      notifyOnRequestPendingApproval,
      notifyOnRequestApproved,
      notifyOnRequestRejected,
      notifyOnListCreated,
      notifyOnTolinoConfigured,
      notifyOnEmailRecipientAdded,
      notifyOnOidcAccountCreated,
      notifyOnOidcRoleUpdated,
      notifyOnServiceUnhealthy,
      notifyOnServiceRecovered,
      notifyOnEmailSent,
      notifyOnTolinoUploaded,
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
        title: tCommon("errors.missing_config"),
        message: t("email.notifications.missing_config.smtp_host"),
        color: "red",
      });
      return;
    }
    if (!senderEmail) {
      notifications.show({
        title: tCommon("errors.missing_config"),
        message: t("email.notifications.missing_config.sender_email"),
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
    (settings &&
      (settings.postDownloadMoveToIngest !== postDownloadMoveToIngest ||
        settings.postDownloadUploadToBooklore !==
          postDownloadUploadToBooklore ||
        settings.postDownloadMoveToIndexer !== postDownloadMoveToIndexer ||
        settings.postDownloadKeepInDownloads !== postDownloadKeepInDownloads ||
        settings.postDownloadNormalizeEpub !== postDownloadNormalizeEpub ||
        settings.postDownloadConvertFormat !== postDownloadConvertFormat ||
        settings.bookRetentionDays !== bookRetentionDays ||
        settings.bookSearchCacheDays !== bookSearchCacheDays ||
        settings.requestCheckInterval !== requestCheckInterval ||
        settings.timeFormat !== timeFormat ||
        settings.dateFormat !== dateFormat ||
        (settings.libraryUrl || "") !== libraryUrl ||
        settings.libraryLinkLocation !== libraryLinkLocation)) ||
    (systemConfig &&
      ((systemConfig.searcherBaseUrl || "") !== searcherBaseUrl ||
        (systemConfig.searcherApiKey || "") !== searcherApiKey ||
        (systemConfig.quickBaseUrl || "") !== quickBaseUrl ||
        systemConfig.downloadFolder !== downloadFolder ||
        systemConfig.ingestFolder !== ingestFolder ||
        systemConfig.retryAttempts !== retryAttempts ||
        systemConfig.requestTimeout !== requestTimeout ||
        systemConfig.searchCacheTtl !== searchCacheTtl ||
        systemConfig.maxConcurrentDownloads !== maxConcurrentDownloads));
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
      appriseSettings.notifyOnRequestPendingApproval !==
        notifyOnRequestPendingApproval ||
      appriseSettings.notifyOnRequestApproved !== notifyOnRequestApproved ||
      appriseSettings.notifyOnRequestRejected !== notifyOnRequestRejected ||
      appriseSettings.notifyOnListCreated !== notifyOnListCreated ||
      appriseSettings.notifyOnTolinoConfigured !== notifyOnTolinoConfigured ||
      appriseSettings.notifyOnEmailRecipientAdded !==
        notifyOnEmailRecipientAdded ||
      appriseSettings.notifyOnOidcAccountCreated !==
        notifyOnOidcAccountCreated ||
      appriseSettings.notifyOnOidcRoleUpdated !== notifyOnOidcRoleUpdated ||
      appriseSettings.notifyOnServiceUnhealthy !== notifyOnServiceUnhealthy ||
      appriseSettings.notifyOnServiceRecovered !== notifyOnServiceRecovered ||
      appriseSettings.notifyOnEmailSent !== notifyOnEmailSent ||
      appriseSettings.notifyOnTolinoUploaded !== notifyOnTolinoUploaded ||
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

  if (loadingPermissions) {
    return (
      <Container size="md">
        <Center p="xl">
          <Loader size="lg" />
        </Center>
      </Container>
    );
  }

  if (isSettingsLoading) {
    return (
      <Container size="md">
        <Center p="xl">
          <Loader size="lg" />
        </Center>
      </Container>
    );
  }

  if (isSettingsError) {
    return (
      <Container size="md">
        <Alert
          icon={<IconInfoCircle size={16} />}
          title={tCommon("errors.title")}
          color="red"
        >
          {t("errors.loading_failed")}
        </Alert>
      </Container>
    );
  }

  return (
    <Container fluid>
      <Stack gap="lg">
        <Title order={1}>{t("title")}</Title>

        <Tabs
          value={tab}
          onChange={(value) =>
            navigate({
              search: {
                tab: value as
                  | "general"
                  | "users"
                  | "lists"
                  | "notifications"
                  | "email"
                  | "oidc"
                  | "proxy-auth"
                  | "booklore"
                  | "indexer"
                  | "tolino",
              },
            })
          }
        >
          <Tabs.List>
            {canConfigureApp && (
              <Tabs.Tab
                value="general"
                leftSection={<IconSettings size={16} />}
              >
                {t("tabs.general")}
              </Tabs.Tab>
            )}
            {isAdmin && (
              <>
                <Tabs.Tab value="users" leftSection={<IconUsers size={16} />}>
                  {t("tabs.users")}
                </Tabs.Tab>
                <Tabs.Tab value="lists" leftSection={<IconList size={16} />}>
                  {t("tabs.lists")}
                </Tabs.Tab>
              </>
            )}
            {canConfigureNotifications && (
              <Tabs.Tab
                value="notifications"
                leftSection={<IconBell size={16} />}
              >
                {t("tabs.notifications")}
              </Tabs.Tab>
            )}
            {/* Email tab accessible to all users for managing their own recipients */}
            <Tabs.Tab value="email" leftSection={<IconMail size={16} />}>
              {t("tabs.email")}
            </Tabs.Tab>
            {isAdmin && (
              <>
                <Tabs.Tab
                  value="oidc"
                  leftSection={<IconPlugConnected size={16} />}
                >
                  {t("tabs.oidc")}
                </Tabs.Tab>
                <Tabs.Tab
                  value="proxy-auth"
                  leftSection={<IconShieldCheck size={16} />}
                >
                  {t("tabs.proxy_auth")}
                </Tabs.Tab>
              </>
            )}
            {canConfigureIntegrations && (
              <>
                <Tabs.Tab
                  value="booklore"
                  leftSection={<IconUpload size={16} />}
                >
                  {t("tabs.booklore")}
                </Tabs.Tab>
                <Tabs.Tab
                  value="indexer"
                  leftSection={<IconServer size={16} />}
                >
                  {t("tabs.indexer")}
                </Tabs.Tab>
              </>
            )}
            {/* Tolino tab for users with canConfigureTolino permission */}
            {canConfigureTolino && (
              <Tabs.Tab value="tolino" leftSection={<IconCloud size={16} />}>
                {t("tabs.tolino")}
              </Tabs.Tab>
            )}
          </Tabs.List>

          {canConfigureApp && (
            <Tabs.Panel value="general" pt="md">
              <Stack gap="lg">
                {/* Post-Download Actions */}
                <Paper p="md" withBorder>
                  <Stack gap="md">
                    <Title order={3}>{t("general.post_download.title")}</Title>
                    <Text size="sm" c="dimmed">
                      {t("general.post_download.description")}
                    </Text>

                    <Stack gap="md">
                      <Checkbox
                        checked={postDownloadMoveToIngest}
                        onChange={(event) =>
                          setPostDownloadMoveToIngest(
                            event.currentTarget.checked,
                          )
                        }
                        label={t("general.post_download.move_to_ingest.label")}
                        description={t(
                          "general.post_download.move_to_ingest.description",
                        )}
                      />

                      <Checkbox
                        checked={postDownloadKeepInDownloads}
                        onChange={(event) =>
                          setPostDownloadKeepInDownloads(
                            event.currentTarget.checked,
                          )
                        }
                        label={t(
                          "general.post_download.keep_in_downloads.label",
                        )}
                        description={t(
                          "general.post_download.keep_in_downloads.description",
                        )}
                        disabled={!postDownloadMoveToIngest}
                      />

                      <Checkbox
                        checked={postDownloadUploadToBooklore}
                        onChange={(event) =>
                          setPostDownloadUploadToBooklore(
                            event.currentTarget.checked,
                          )
                        }
                        label={t(
                          "general.post_download.upload_to_booklore.label",
                        )}
                        description={t(
                          "general.post_download.upload_to_booklore.description",
                        )}
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
                        label={t("general.post_download.move_to_indexer.label")}
                        description={t(
                          "general.post_download.move_to_indexer.description",
                        )}
                        disabled={
                          !indexerSettings?.newznabEnabled &&
                          !indexerSettings?.sabnzbdEnabled
                        }
                      />

                      <Checkbox
                        checked={postDownloadNormalizeEpub}
                        onChange={(event) =>
                          setPostDownloadNormalizeEpub(
                            event.currentTarget.checked,
                          )
                        }
                        label={t("general.post_download.normalize_epub.label")}
                        description={t(
                          "general.post_download.normalize_epub.description",
                        )}
                      />

                      <Select
                        label={t("general.post_download.convert.label")}
                        description={t(
                          "general.post_download.convert.description",
                        )}
                        placeholder={t(
                          "general.post_download.convert.placeholder",
                        )}
                        value={postDownloadConvertFormat}
                        onChange={(value) =>
                          setPostDownloadConvertFormat(
                            value as "epub" | "pdf" | "mobi" | "azw3" | null,
                          )
                        }
                        data={[
                          { value: "epub", label: "EPUB" },
                          { value: "pdf", label: "PDF" },
                          { value: "mobi", label: "MOBI" },
                          { value: "azw3", label: "AZW3" },
                        ]}
                        clearable
                      />
                    </Stack>

                    {(!bookloreSettings?.enabled ||
                      !bookloreSettings?.connected) && (
                      <Alert icon={<IconInfoCircle size={16} />} color="blue">
                        <Text size="sm">
                          <strong>{tCommon("note")}:</strong>{" "}
                          {!bookloreSettings?.enabled
                            ? t("general.post_download.booklore_note.disabled")
                            : t("general.post_download.booklore_note.enabled")}
                        </Text>
                      </Alert>
                    )}
                  </Stack>
                </Paper>

                {/* Requests */}
                <Paper p="md" withBorder>
                  <Stack gap="md">
                    <Title order={3}>{t("general.requests.title")}</Title>
                    <Text size="sm" c="dimmed">
                      {t("general.requests.description")}
                    </Text>

                    <Select
                      label={t("general.requests.check_interval.label")}
                      description={t(
                        "general.requests.check_interval.description",
                      )}
                      placeholder={t(
                        "general.requests.check_interval.placeholder",
                      )}
                      value={requestCheckInterval}
                      onChange={(value) =>
                        setRequestCheckInterval(value as RequestCheckInterval)
                      }
                      data={[
                        {
                          value: "1min",
                          label: t("general.requests.intervals.1min"),
                        },
                        {
                          value: "15min",
                          label: t("general.requests.intervals.15min"),
                        },
                        {
                          value: "30min",
                          label: t("general.requests.intervals.30min"),
                        },
                        {
                          value: "1h",
                          label: t("general.requests.intervals.1h"),
                        },
                        {
                          value: "6h",
                          label: t("general.requests.intervals.6h"),
                        },
                        {
                          value: "12h",
                          label: t("general.requests.intervals.12h"),
                        },
                        {
                          value: "24h",
                          label: t("general.requests.intervals.24h"),
                        },
                        {
                          value: "weekly",
                          label: t("general.requests.intervals.weekly"),
                        },
                      ]}
                      required
                    />

                    {requestCheckInterval === "1min" && (
                      <Alert icon={<IconInfoCircle size={16} />} color="red">
                        <Text size="sm">
                          <strong>{tCommon("warning")}:</strong>{" "}
                          {t("general.requests.check_interval.warning")}
                        </Text>
                      </Alert>
                    )}
                  </Stack>
                </Paper>

                {/* Display Preferences */}
                <Paper p="md" withBorder>
                  <Stack gap="md">
                    <Title order={3}>{t("general.display.title")}</Title>
                    <Text size="sm" c="dimmed">
                      {t("general.display.description")}
                    </Text>

                    <Radio.Group
                      label={t("general.display.time_format.label")}
                      description={t("general.display.time_format.description")}
                      value={timeFormat}
                      onChange={(value) => setTimeFormat(value as TimeFormat)}
                    >
                      <Stack gap="sm" mt="xs">
                        <Radio
                          value="24h"
                          label={t("general.display.time_format.h24")}
                          description={t(
                            "general.display.time_format.h24_desc",
                          )}
                        />
                        <Radio
                          value="ampm"
                          label={t("general.display.time_format.ampm")}
                          description={t(
                            "general.display.time_format.ampm_desc",
                          )}
                        />
                      </Stack>
                    </Radio.Group>

                    <Radio.Group
                      label={t("general.display.date_format.label")}
                      description={t("general.display.date_format.description")}
                      value={dateFormat}
                      onChange={(value) => setDateFormat(value as DateFormat)}
                    >
                      <Stack gap="sm" mt="xs">
                        <Radio
                          value="eur"
                          label={t("general.display.date_format.eur")}
                          description={t(
                            "general.display.date_format.eur_desc",
                          )}
                        />
                        <Radio
                          value="us"
                          label={t("general.display.date_format.us")}
                          description={t("general.display.date_format.us_desc")}
                        />
                      </Stack>
                    </Radio.Group>
                  </Stack>
                </Paper>

                {/* Library Link */}
                <Paper p="md" withBorder>
                  <Stack gap="md">
                    <Title order={3}>{t("general.library_link.title")}</Title>
                    <Text size="sm" c="dimmed">
                      {t("general.library_link.description")}
                    </Text>

                    <TextInput
                      label={t("general.library_link.url.label")}
                      placeholder={t("general.library_link.url.placeholder")}
                      value={libraryUrl}
                      onChange={(e) => setLibraryUrl(e.target.value)}
                      description={t("general.library_link.url.description")}
                    />

                    <Radio.Group
                      label={t("general.library_link.location.label")}
                      description={t(
                        "general.library_link.location.description",
                      )}
                      value={libraryLinkLocation}
                      onChange={(value) =>
                        setLibraryLinkLocation(value as LibraryLinkLocation)
                      }
                    >
                      <Stack gap="sm" mt="xs">
                        <Radio
                          value="sidebar"
                          label={t("general.library_link.location.sidebar")}
                          description={t(
                            "general.library_link.location.sidebar_desc",
                          )}
                        />
                        <Radio
                          value="header"
                          label={t("general.library_link.location.header")}
                          description={t(
                            "general.library_link.location.header_desc",
                          )}
                        />
                        <Radio
                          value="both"
                          label={t("general.library_link.location.both")}
                          description={t(
                            "general.library_link.location.both_desc",
                          )}
                        />
                      </Stack>
                    </Radio.Group>
                  </Stack>
                </Paper>

                {/* Cache */}
                <Paper p="md" withBorder>
                  <Stack gap="md">
                    <Title order={3}>{t("general.cache.title")}</Title>
                    <Text size="sm" c="dimmed">
                      {t("general.cache.description")}
                    </Text>

                    <NumberInput
                      label={t("general.cache.retention.label")}
                      description={t("general.cache.retention.description")}
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
                      label={t("general.cache.search_days.label")}
                      description={t("general.cache.search_days.description")}
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

                {/* Archive/Searcher Settings */}
                <Paper p="md" withBorder>
                  <Stack gap="md">
                    <Title order={3}>{t("general.archive.title")}</Title>
                    <Text size="sm" c="dimmed">
                      {t("general.archive.description")}
                    </Text>

                    <TextInput
                      label={t("general.archive.searcher_url.label")}
                      description={t(
                        "general.archive.searcher_url.description",
                      )}
                      value={searcherBaseUrl}
                      onChange={(e) => setSearcherBaseUrl(e.target.value)}
                      placeholder={t(
                        "general.archive.searcher_url.placeholder",
                      )}
                      required
                    />

                    <PasswordInput
                      label={t("general.archive.api_key.label")}
                      description={t("general.archive.api_key.description")}
                      value={searcherApiKey}
                      onChange={(e) => setSearcherApiKey(e.target.value)}
                      placeholder={t("general.archive.api_key.placeholder")}
                    />

                    <TextInput
                      label={t("general.archive.quick_url.label")}
                      description={t("general.archive.quick_url.description")}
                      value={quickBaseUrl}
                      onChange={(e) => setQuickBaseUrl(e.target.value)}
                      placeholder={t("general.archive.quick_url.placeholder")}
                    />
                  </Stack>
                </Paper>

                {/* Folder Paths */}
                <Paper p="md" withBorder>
                  <Stack gap="md">
                    <Title order={3}>{t("general.folders.title")}</Title>
                    <Text size="sm" c="dimmed">
                      {t("general.folders.description")}
                    </Text>

                    <TextInput
                      label={t("general.folders.download.label")}
                      description={t("general.folders.download.description")}
                      value={downloadFolder}
                      onChange={(e) => setDownloadFolder(e.target.value)}
                      placeholder={t("general.folders.download.placeholder")}
                    />

                    <TextInput
                      label={t("general.folders.ingest.label")}
                      description={t("general.folders.ingest.description")}
                      value={ingestFolder}
                      onChange={(e) => setIngestFolder(e.target.value)}
                      placeholder={t("general.folders.ingest.placeholder")}
                    />
                  </Stack>
                </Paper>

                {/* Download Settings */}
                <Paper p="md" withBorder>
                  <Stack gap="md">
                    <Title order={3}>
                      {t("general.download_settings.title")}
                    </Title>
                    <Text size="sm" c="dimmed">
                      {t("general.download_settings.description")}
                    </Text>

                    <NumberInput
                      label={t(
                        "general.download_settings.max_concurrent.label",
                      )}
                      description={t(
                        "general.download_settings.max_concurrent.description",
                      )}
                      value={maxConcurrentDownloads}
                      onChange={(val) =>
                        setMaxConcurrentDownloads(Number(val) || 1)
                      }
                      min={1}
                      max={5}
                    />

                    <NumberInput
                      label={t(
                        "general.download_settings.retry_attempts.label",
                      )}
                      description={t(
                        "general.download_settings.retry_attempts.description",
                      )}
                      value={retryAttempts}
                      onChange={(val) => setRetryAttempts(Number(val) || 3)}
                      min={1}
                      max={10}
                    />

                    <NumberInput
                      label={t("general.download_settings.timeout.label")}
                      description={t(
                        "general.download_settings.timeout.description",
                      )}
                      value={requestTimeout}
                      onChange={(val) =>
                        setRequestTimeout(Number(val) || 30000)
                      }
                      min={5000}
                      max={300000}
                      step={1000}
                    />

                    <NumberInput
                      label={t("general.download_settings.cache_ttl.label")}
                      description={t(
                        "general.download_settings.cache_ttl.description",
                      )}
                      value={searchCacheTtl}
                      onChange={(val) => setSearchCacheTtl(Number(val) || 300)}
                      min={60}
                      max={86400}
                      step={60}
                    />
                  </Stack>
                </Paper>

                <Group justify="flex-end">
                  <Button
                    onClick={handleSaveApp}
                    disabled={!hasAppChanges}
                    loading={
                      updateSettings.isPending || updateSystemConfig.isPending
                    }
                  >
                    {tCommon("actions.save_settings")}
                  </Button>
                </Group>
              </Stack>
            </Tabs.Panel>
          )}

          <Tabs.Panel value="notifications" pt="md">
            <Stack gap="lg">
              {/* Apprise Notifications */}
              <Paper p="md" withBorder>
                <Stack gap="md">
                  <Group justify="space-between">
                    <div>
                      <Title order={3}>
                        <Group gap="xs">{t("notifications.title")}</Group>
                      </Title>
                      <Text size="sm" c="dimmed">
                        {t("notifications.description")}{" "}
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
                      label={tCommon("enabled")}
                      size="lg"
                    />
                  </Group>

                  {appriseEnabled && (
                    <Stack gap="sm">
                      <TextInput
                        label={t("notifications.url.label")}
                        placeholder="http://apprise:8111/notify/apprise"
                        value={appriseServerUrl}
                        onChange={(e) => setAppriseServerUrl(e.target.value)}
                        description={t("notifications.url.description")}
                        required
                      />

                      {/* Custom Headers */}
                      <Stack gap="xs">
                        <Group justify="space-between">
                          <Text size="sm" fw={500}>
                            {t("notifications.headers.title")}
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
                            {t("notifications.headers.add")}
                          </Button>
                        </Group>
                        {customHeaders.map((header, index) => (
                          <Group key={index} gap="xs">
                            <TextInput
                              placeholder={t("notifications.headers.name")}
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
                              placeholder={t("notifications.headers.value")}
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
                      <Stack gap="md" mt="md">
                        {/* Request Notifications */}
                        <Stack gap="xs">
                          <Text size="sm" fw={500}>
                            {t("notifications.events.requests.title")}
                          </Text>
                          <Checkbox
                            label={t(
                              "notifications.events.requests.new_request",
                            )}
                            checked={notifyOnNewRequest}
                            onChange={(e) =>
                              setNotifyOnNewRequest(e.currentTarget.checked)
                            }
                          />
                          <Checkbox
                            label={t(
                              "notifications.events.requests.request_fulfilled",
                            )}
                            checked={notifyOnRequestFulfilled}
                            onChange={(e) =>
                              setNotifyOnRequestFulfilled(
                                e.currentTarget.checked,
                              )
                            }
                          />
                          <Checkbox
                            label={t(
                              "notifications.events.requests.request_pending",
                            )}
                            checked={notifyOnRequestPendingApproval}
                            onChange={(e) =>
                              setNotifyOnRequestPendingApproval(
                                e.currentTarget.checked,
                              )
                            }
                          />
                          <Checkbox
                            label={t(
                              "notifications.events.requests.request_approved",
                            )}
                            checked={notifyOnRequestApproved}
                            onChange={(e) =>
                              setNotifyOnRequestApproved(
                                e.currentTarget.checked,
                              )
                            }
                          />
                          <Checkbox
                            label={t(
                              "notifications.events.requests.request_rejected",
                            )}
                            checked={notifyOnRequestRejected}
                            onChange={(e) =>
                              setNotifyOnRequestRejected(
                                e.currentTarget.checked,
                              )
                            }
                          />
                        </Stack>

                        {/* Download Notifications */}
                        <Stack gap="xs">
                          <Text size="sm" fw={500}>
                            {t("notifications.events.downloads.title")}
                          </Text>
                          <Checkbox
                            label={t("notifications.events.downloads.queued")}
                            checked={notifyOnBookQueued}
                            onChange={(e) =>
                              setNotifyOnBookQueued(e.currentTarget.checked)
                            }
                          />
                          <Checkbox
                            label={t(
                              "notifications.events.downloads.available",
                            )}
                            checked={notifyOnAvailable}
                            onChange={(e) =>
                              setNotifyOnAvailable(e.currentTarget.checked)
                            }
                          />
                          <Checkbox
                            label={t("notifications.events.downloads.error")}
                            checked={notifyOnDownloadError}
                            onChange={(e) =>
                              setNotifyOnDownloadError(e.currentTarget.checked)
                            }
                          />
                          <Checkbox
                            label={t("notifications.events.downloads.delayed")}
                            checked={notifyOnDelayed}
                            onChange={(e) =>
                              setNotifyOnDelayed(e.currentTarget.checked)
                            }
                          />
                        </Stack>

                        {/* Integration Notifications */}
                        <Stack gap="xs">
                          <Text size="sm" fw={500}>
                            {t("notifications.events.integrations.title")}
                          </Text>
                          <Checkbox
                            label={t(
                              "notifications.events.integrations.list_created",
                            )}
                            checked={notifyOnListCreated}
                            onChange={(e) =>
                              setNotifyOnListCreated(e.currentTarget.checked)
                            }
                          />
                          <Checkbox
                            label={t(
                              "notifications.events.integrations.recipient_added",
                            )}
                            checked={notifyOnEmailRecipientAdded}
                            onChange={(e) =>
                              setNotifyOnEmailRecipientAdded(
                                e.currentTarget.checked,
                              )
                            }
                          />
                          <Checkbox
                            label={t(
                              "notifications.events.integrations.email_sent",
                            )}
                            description={t("notifications.events.high_volume")}
                            checked={notifyOnEmailSent}
                            onChange={(e) =>
                              setNotifyOnEmailSent(e.currentTarget.checked)
                            }
                          />
                          <Checkbox
                            label={t(
                              "notifications.events.integrations.tolino_configured",
                            )}
                            checked={notifyOnTolinoConfigured}
                            onChange={(e) =>
                              setNotifyOnTolinoConfigured(
                                e.currentTarget.checked,
                              )
                            }
                          />
                          <Checkbox
                            label={t(
                              "notifications.events.integrations.tolino_uploaded",
                            )}
                            description={t("notifications.events.high_volume")}
                            checked={notifyOnTolinoUploaded}
                            onChange={(e) =>
                              setNotifyOnTolinoUploaded(e.currentTarget.checked)
                            }
                          />
                        </Stack>

                        {/* System Notifications */}
                        <Stack gap="xs">
                          <Text size="sm" fw={500}>
                            {t("notifications.events.system.title")}
                          </Text>
                          <Checkbox
                            label={t("notifications.events.system.update")}
                            checked={notifyOnUpdateAvailable}
                            onChange={(e) =>
                              setNotifyOnUpdateAvailable(
                                e.currentTarget.checked,
                              )
                            }
                          />
                          <Checkbox
                            label={t("notifications.events.system.unhealthy")}
                            checked={notifyOnServiceUnhealthy}
                            onChange={(e) =>
                              setNotifyOnServiceUnhealthy(
                                e.currentTarget.checked,
                              )
                            }
                          />
                          <Checkbox
                            label={t("notifications.events.system.recovered")}
                            checked={notifyOnServiceRecovered}
                            onChange={(e) =>
                              setNotifyOnServiceRecovered(
                                e.currentTarget.checked,
                              )
                            }
                          />
                        </Stack>

                        {/* Authentication Notifications */}
                        <Stack gap="xs">
                          <Text size="sm" fw={500}>
                            {t("notifications.events.auth.title")}
                          </Text>
                          <Checkbox
                            label={t(
                              "notifications.events.auth.oidc_account_created",
                            )}
                            checked={notifyOnOidcAccountCreated}
                            onChange={(e) =>
                              setNotifyOnOidcAccountCreated(
                                e.currentTarget.checked,
                              )
                            }
                          />
                          <Checkbox
                            label={t(
                              "notifications.events.auth.oidc_role_updated",
                            )}
                            checked={notifyOnOidcRoleUpdated}
                            onChange={(e) =>
                              setNotifyOnOidcRoleUpdated(
                                e.currentTarget.checked,
                              )
                            }
                          />
                        </Stack>
                      </Stack>

                      <Group justify="flex-end" mt="md">
                        <Button
                          variant="outline"
                          leftSection={<IconBell size={16} />}
                          onClick={handleTestApprise}
                          loading={testApprise.isPending}
                          disabled={!appriseServerUrl}
                        >
                          {t("notifications.test_button")}
                        </Button>
                        <Button
                          onClick={handleSaveApprise}
                          disabled={!hasAppriseChanges}
                          loading={updateApprise.isPending}
                        >
                          {tCommon("actions.save_settings")}
                        </Button>
                      </Group>
                    </Stack>
                  )}

                  {!appriseEnabled && (
                    <>
                      <Alert icon={<IconInfoCircle size={16} />} color="gray">
                        <Text size="sm">
                          {t("notifications.disabled_message")}
                        </Text>
                      </Alert>

                      {/* Show save button if user toggled Apprise off */}
                      {appriseSettings && appriseSettings.enabled && (
                        <Group justify="flex-end">
                          <Button
                            onClick={handleSaveApprise}
                            loading={updateApprise.isPending}
                          >
                            {tCommon("actions.save_settings")}
                          </Button>
                        </Group>
                      )}
                    </>
                  )}
                </Stack>
              </Paper>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="booklore" pt="md">
            <Stack gap="lg">
              {/* Booklore Settings */}
              <Paper p="md" withBorder>
                <Stack gap="md">
                  <Group justify="space-between">
                    <div>
                      <Title order={3}>{t("booklore.title")}</Title>
                      <Text size="sm" c="dimmed">
                        {t("booklore.description")}
                      </Text>
                    </div>
                    <Switch
                      checked={bookloreEnabled}
                      onChange={(e) =>
                        setBookloreEnabled(e.currentTarget.checked)
                      }
                      label={tCommon("enabled")}
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
                          {t("booklore.buttons.disable")}
                        </Button>
                      </Group>
                    )}

                  {bookloreEnabled && (
                    <Stack gap="sm">
                      <TextInput
                        label={t("booklore.fields.url.label")}
                        placeholder="http://192.168.7.3:6060"
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                        required
                      />

                      {/* Show library/path dropdowns only after authentication */}
                      {bookloreSettings?.connected && librariesData ? (
                        <>
                          <Select
                            label={t("booklore.fields.library.label")}
                            placeholder={t(
                              "booklore.fields.library.placeholder",
                            )}
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
                            label={t("booklore.fields.path.label")}
                            placeholder={t("booklore.fields.path.placeholder")}
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
                          <Text size="sm">{t("booklore.library.loading")}</Text>
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
                              {t("booklore.status.connected")}
                            </Text>
                            {bookloreSettings.accessTokenExpiresAt && (
                              <Text size="xs" c="dimmed">
                                {t("booklore.status.token_expires", {
                                  date: formatDate(
                                    bookloreSettings.accessTokenExpiresAt,
                                    dateFormat,
                                    timeFormat,
                                  ),
                                })}
                              </Text>
                            )}
                            {bookloreSettings.refreshTokenExpiresAt && (
                              <Text size="xs" c="dimmed">
                                {t("booklore.status.refresh_expires", {
                                  date: formatDate(
                                    bookloreSettings.refreshTokenExpiresAt,
                                    dateFormat,
                                    timeFormat,
                                  ),
                                })}
                              </Text>
                            )}
                            <Button
                              size="xs"
                              variant="light"
                              onClick={() => setShowAuthForm(true)}
                              mt="xs"
                            >
                              {t("booklore.status.reauthenticate")}
                            </Button>
                          </Stack>
                        </Alert>
                      )}

                      {/* Show authentication form when needed */}
                      {(showAuthForm || !bookloreSettings?.connected) && (
                        <Stack gap="sm">
                          <TextInput
                            label={t("booklore.auth.username.label")}
                            placeholder={t(
                              "booklore.auth.username.placeholder",
                            )}
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            description={t(
                              "booklore.auth.username.description",
                            )}
                            required
                          />

                          <PasswordInput
                            label={t("booklore.auth.password.label")}
                            placeholder={t(
                              "booklore.auth.password.placeholder",
                            )}
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
                          <strong>{tCommon("note")}:</strong>{" "}
                          {t("booklore.note_upload")}
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
                          {t("booklore.test_button")}
                        </Button>
                        <Button
                          onClick={handleSaveBooklore}
                          disabled={!hasBookloreChanges}
                          loading={updateBooklore.isPending}
                        >
                          {!bookloreSettings?.connected && username && password
                            ? t("booklore.buttons.authenticate")
                            : bookloreSettings?.connected &&
                                (libraryId || pathId)
                              ? t("booklore.buttons.save_lib")
                              : tCommon("actions.save_settings")}
                        </Button>
                      </Group>
                    </Stack>
                  )}

                  {!bookloreEnabled && (
                    <>
                      <Alert icon={<IconInfoCircle size={16} />} color="gray">
                        <Text size="sm">{t("booklore.disabled_message")}</Text>
                      </Alert>

                      {/* Show clear auth button if tokens still exist while disabled */}
                      {bookloreSettings?.connected && (
                        <Alert
                          icon={<IconInfoCircle size={16} />}
                          color="yellow"
                        >
                          <Stack gap="xs">
                            <Text size="sm">
                              {t("booklore.clear_auth.message")}
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
                              {t("booklore.buttons.clear_auth")}
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

          <Tabs.Panel value="indexer" pt="md">
            <IndexerSettings />
          </Tabs.Panel>

          <Tabs.Panel value="email" pt="md">
            <Stack gap="lg">
              {/* SMTP Settings - Only for users with canConfigureEmail permission */}
              {canConfigureEmail && (
                <Paper p="md" withBorder>
                  <Stack gap="md">
                    <Group justify="space-between">
                      <div>
                        <Title order={3}>{t("email.smtp.title")}</Title>
                        <Text size="sm" c="dimmed">
                          {t("email.smtp.description")}
                        </Text>
                      </div>
                      <Switch
                        checked={emailEnabled}
                        onChange={(e) =>
                          setEmailEnabled(e.currentTarget.checked)
                        }
                        label={t("email.smtp.enabled")}
                        size="lg"
                      />
                    </Group>

                    {emailEnabled && !frontendConfig?.keepInDownloads && (
                      <Alert
                        icon={<IconAlertTriangle size={16} />}
                        color="orange"
                        title={t("email.smtp.file_access_warning.title")}
                      >
                        <Text size="sm">
                          <Trans i18nKey="settings.email.smtp.file_access_warning.message">
                            Enable{" "}
                            <strong>"Keep copy in downloads folder"</strong> in
                            the General tab under Post-Download Actions to use
                            email sending. Without this setting, downloaded
                            files may not be available for email attachments.
                          </Trans>
                        </Text>
                      </Alert>
                    )}

                    {emailEnabled && (
                      <Stack gap="sm">
                        <TextInput
                          label={t("email.fields.host.label")}
                          placeholder={t("email.fields.host.placeholder")}
                          value={smtpHost}
                          onChange={(e) => setSmtpHost(e.target.value)}
                          required
                        />
                        <NumberInput
                          label={t("email.fields.port.label")}
                          value={smtpPort}
                          onChange={(val) => setSmtpPort(Number(val) || 587)}
                          min={1}
                          max={65535}
                        />
                        <TextInput
                          label={t("email.fields.username.label")}
                          placeholder={t("email.fields.username.placeholder")}
                          value={smtpUser}
                          onChange={(e) => setSmtpUser(e.target.value)}
                        />
                        <PasswordInput
                          label={t("email.fields.password.label")}
                          placeholder={t("email.fields.password.placeholder")}
                          value={smtpPassword}
                          onChange={(e) => setSmtpPassword(e.target.value)}
                        />
                        <TextInput
                          label={t("email.fields.sender_email.label")}
                          placeholder={t(
                            "email.fields.sender_email.placeholder",
                          )}
                          value={senderEmail}
                          onChange={(e) => setSenderEmail(e.target.value)}
                          required
                        />
                        <TextInput
                          label={t("email.fields.sender_name.label")}
                          placeholder={t(
                            "email.fields.sender_name.placeholder",
                          )}
                          value={senderName}
                          onChange={(e) => setSenderName(e.target.value)}
                        />
                        <Switch
                          checked={useTls}
                          onChange={(e) => setUseTls(e.currentTarget.checked)}
                          label={t("email.fields.tls.label")}
                        />

                        <Group justify="flex-end" mt="md">
                          <Button
                            variant="outline"
                            onClick={handleTestEmail}
                            loading={testEmail.isPending}
                            disabled={!smtpHost || !senderEmail}
                          >
                            {t("email.buttons.test")}
                          </Button>
                          <Button
                            onClick={handleSaveEmail}
                            disabled={!hasEmailChanges}
                            loading={updateEmail.isPending}
                          >
                            {tCommon("actions.save_settings")}
                          </Button>
                        </Group>
                      </Stack>
                    )}

                    {!emailEnabled && (
                      <>
                        <Alert icon={<IconInfoCircle size={16} />} color="gray">
                          <Text size="sm">{t("email.disabled_message")}</Text>
                        </Alert>

                        {/* Show save button if user toggled email off */}
                        {emailSettings && emailSettings.enabled && (
                          <Group justify="flex-end">
                            <Button
                              onClick={handleSaveEmail}
                              loading={updateEmail.isPending}
                            >
                              {tCommon("actions.save_settings")}
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
                    <Title order={3}>{t("email.recipients.title")}</Title>
                    <Text size="sm" c="dimmed">
                      {isAdmin
                        ? t("email.recipients.description.admin")
                        : t("email.recipients.description.user")}
                    </Text>
                  </div>

                  {/* Show notice if email is not configured */}
                  {!isEmailConfigured && (
                    <Alert icon={<IconInfoCircle size={16} />} color="yellow">
                      <Text size="sm">
                        {isAdmin
                          ? t("email.recipients.not_configured.admin")
                          : t("email.recipients.not_configured.user")}
                      </Text>
                    </Alert>
                  )}

                  {/* Only show form when email is configured */}
                  {isEmailConfigured && (
                    <>
                      <Group gap="xs">
                        <TextInput
                          placeholder={t(
                            "email.recipients.form.email_placeholder",
                          )}
                          value={newRecipientEmail}
                          onChange={(e) => setNewRecipientEmail(e.target.value)}
                          style={{ flex: 2 }}
                        />
                        <TextInput
                          placeholder={t(
                            "email.recipients.form.name_placeholder",
                          )}
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
                          {tCommon("actions.add")}
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
                                  label={t("email.recipients.table.auto_send")}
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
                                      <Tooltip
                                        label={t(
                                          "email.recipients.table.reassign",
                                        )}
                                      >
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
                                      <Menu.Label>
                                        {t(
                                          "email.recipients.table.reassign_to",
                                        )}
                                      </Menu.Label>
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
                          {t("email.recipients.table.empty")}
                        </Text>
                      )}
                    </>
                  )}
                </Stack>
              </Paper>
            </Stack>
          </Tabs.Panel>

          {/* Tolino Tab */}
          {canConfigureTolino && (
            <Tabs.Panel value="tolino" pt="md">
              <Suspense
                fallback={
                  <Center p="xl">
                    <Loader size="lg" />
                  </Center>
                }
              >
                <TolinoSettings
                  keepInDownloads={frontendConfig?.keepInDownloads ?? false}
                />
              </Suspense>
            </Tabs.Panel>
          )}

          {isAdmin && (
            <>
              <Tabs.Panel value="users" pt="md">
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

              <Tabs.Panel value="oidc" pt="md">
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

              <Tabs.Panel value="proxy-auth" pt="md">
                <Suspense
                  fallback={
                    <Center p="xl">
                      <Loader size="lg" />
                    </Center>
                  }
                >
                  <ProxyAuthSettings />
                </Suspense>
              </Tabs.Panel>
              <Tabs.Panel value="lists" pt="md">
                <Suspense
                  fallback={
                    <Center p="xl">
                      <Loader size="lg" />
                    </Center>
                  }
                >
                  <ListsSettings />
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
