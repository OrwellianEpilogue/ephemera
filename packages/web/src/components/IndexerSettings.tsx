import { useState, useEffect } from "react";
import {
  Paper,
  Stack,
  Switch,
  TextInput,
  Group,
  Alert,
  ActionIcon,
  Text,
  Title,
  CopyButton,
  Tooltip,
  Code,
  Divider,
} from "@mantine/core";
import { FolderInput } from "./FolderInput";
import {
  IconCopy,
  IconCheck,
  IconRefresh,
  IconInfoCircle,
} from "@tabler/icons-react";
import {
  useIndexerSettings,
  useUpdateIndexerSettings,
  useRegenerateApiKey,
} from "../hooks/use-indexer-settings";
import { notifications } from "@mantine/notifications";
import { useTranslation, Trans } from "react-i18next";

export function IndexerSettings() {
  const { t } = useTranslation("translation", {
    keyPrefix: "settings.indexer",
  });
  const { data: settings, isLoading, error } = useIndexerSettings();
  const updateSettings = useUpdateIndexerSettings();
  const regenerateKey = useRegenerateApiKey();

  const [baseUrl, setBaseUrl] = useState("http://localhost:8286");
  const [indexersEnabled, setIndexersEnabled] = useState(false);
  const [indexerOnlyMode, setIndexerOnlyMode] = useState(false);
  const homeDir =
    typeof globalThis !== "undefined" &&
    typeof globalThis.window !== "undefined" &&
    globalThis.window.location.hostname === "localhost"
      ? "/Users"
      : "/home";
  const [indexerCompletedDir, setIndexerCompletedDir] = useState(
    `${homeDir}/downloads/complete`,
  );
  const [indexerIncompleteDir, setIndexerIncompleteDir] = useState(
    `${homeDir}/downloads/incomplete`,
  );
  const [indexerCategoryDir, setIndexerCategoryDir] = useState(false);

  // Update local state when settings load
  useEffect(() => {
    if (settings) {
      setBaseUrl(settings.baseUrl || "http://localhost:8286");
      // Both are enabled together
      setIndexersEnabled(settings.newznabEnabled && settings.sabnzbdEnabled);
      setIndexerOnlyMode(!!settings.indexerOnlyMode);
      setIndexerCompletedDir(
        settings.indexerCompletedDir || `${homeDir}/downloads/complete`,
      );
      setIndexerIncompleteDir(
        settings.indexerIncompleteDir || `${homeDir}/downloads/incomplete`,
      );
      setIndexerCategoryDir(!!settings.indexerCategoryDir);
    }
  }, [settings, homeDir]);

  const handleIndexersToggle = async (enabled: boolean) => {
    setIndexersEnabled(enabled);
    try {
      // Enable or disable both APIs together
      await updateSettings.mutateAsync({
        newznabEnabled: enabled,
        sabnzbdEnabled: enabled,
      });
      notifications.show({
        title: t("notifications.settings_updated"),
        message: t("notifications.enabled", {
          state: enabled ? "enabled" : "disabled",
        }),
        color: "green",
      });
    } catch (_error) {
      notifications.show({
        title: "Error",
        message: "Failed to update settings",
        color: "red",
      });
      setIndexersEnabled(!enabled); // Revert on error
    }
  };

  const handleRegenerateKey = async (service: "newznab" | "sabnzbd") => {
    try {
      await regenerateKey.mutateAsync({ service });
      notifications.show({
        title: t("notifications.key_regenerated"),
        message: t("notifications.key_success", { service }),
        color: "green",
      });
    } catch (_error) {
      notifications.show({
        title: t("notifications.error.title"),
        message: t("notifications.key_failed", { service }),
        color: "red",
      });
    }
  };

  const handleBaseUrlSave = async () => {
    try {
      await updateSettings.mutateAsync({ baseUrl });
      notifications.show({
        title: t("notifications.settings_updated"),
        message: t("notifications.base_url_updated"),
        color: "green",
      });
    } catch (_error) {
      notifications.show({
        title: t("notifications.error.title"),
        message: t("notifications.base_url_failed"),
        color: "red",
      });
    }
  };

  const handleIndexerOnlyModeToggle = async (enabled: boolean) => {
    setIndexerOnlyMode(enabled);
    try {
      await updateSettings.mutateAsync({ indexerOnlyMode: enabled });
      notifications.show({
        title: t("notifications.settings_updated"),
        message: t("notifications.indexer_mode_updated", {
          state: enabled ? "enabled" : "disabled",
        }),
        color: "green",
      });
    } catch (_error) {
      notifications.show({
        title: t("notifications.error.title"),
        message: t("notifications.indexer_mode_failed"),
        color: "red",
      });
      setIndexerOnlyMode(!enabled); // Revert on error
    }
  };

  const handleDirectorySave = async (
    field: "completed" | "incomplete",
    value?: string,
  ) => {
    try {
      // Use the provided value or fall back to state
      const pathValue =
        value !== undefined
          ? value
          : field === "completed"
            ? indexerCompletedDir
            : indexerIncompleteDir;

      const updates =
        field === "completed"
          ? { indexerCompletedDir: pathValue }
          : { indexerIncompleteDir: pathValue };

      await updateSettings.mutateAsync(updates);
      notifications.show({
        title: t("notifications.settings_updated"),
        message: t("notifications.directory_updated", {
          type: field === "completed" ? "completed" : "incomplete",
        }),
        color: "green",
      });
    } catch {
      notifications.show({
        title: t("notifications.error.title"),
        message: t("notifications.directory_failed", {
          type: field === "completed" ? "completed" : "incomplete",
        }),
        color: "red",
      });
    }
  };

  const handleCategoryDirToggle = async (enabled: boolean) => {
    setIndexerCategoryDir(enabled);
    try {
      await updateSettings.mutateAsync({ indexerCategoryDir: enabled });
      notifications.show({
        title: t("notifications.settings_updated"),
        message: t("notifications.category_updated", {
          state: enabled ? "enabled" : "disabled",
        }),
        color: "green",
      });
    } catch (_error) {
      notifications.show({
        title: t("notifications.error.title"),
        message: t("notifications.category_failed"),
        color: "red",
      });
      setIndexerCategoryDir(!enabled); // Revert on error
    }
  };

  if (error) {
    return (
      <Alert icon={<IconInfoCircle size="1rem" />} color="red">
        <Text>
          {t("errors.load_failed")}: {String(error)}
        </Text>
      </Alert>
    );
  }

  if (isLoading || !settings) {
    return <Text>{t("common.status.loading")}</Text>;
  }

  return (
    <Stack gap="lg">
      <Alert icon={<IconInfoCircle size="1rem" />} variant="light">
        <Text size="sm">{t("info_alert")}</Text>
      </Alert>

      {/* Base URL Configuration */}
      <Paper p="md" withBorder>
        <Stack gap="md">
          <Title order={4}>{t("api_config.title")}</Title>
          <TextInput
            label={t("api_config.base_url.label")}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.currentTarget.value)}
            onBlur={handleBaseUrlSave}
            placeholder={t("api_config.base_url.placeholder")}
            description={t("api_config.base_url.description")}
            required
          />
          <Text size="xs" c="dimmed">
            {t("api_config.base_url.note")}
          </Text>
        </Stack>
      </Paper>

      {/* Indexer APIs Settings */}
      <Paper p="md" withBorder>
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <div>
              <Title order={4}>{t("indexer_apis.title")}</Title>
              <Text size="sm" c="dimmed">
                {t("indexer_apis.description")}
              </Text>
            </div>
            <Switch
              checked={indexersEnabled}
              onChange={(e) => handleIndexersToggle(e.currentTarget.checked)}
              size="lg"
              disabled={updateSettings.isPending}
              label={t("indexer_apis.enabled")}
            />
          </Group>

          {indexersEnabled && (
            <>
              <Divider />
              <Stack gap="md">
                {/* Newznab Configuration */}
                <Stack gap="sm">
                  <Title order={5}>{t("indexer_apis.newznab.title")}</Title>
                  <TextInput
                    label={t("indexer_apis.newznab.api_key")}
                    value={settings.newznabApiKey || ""}
                    readOnly
                    rightSectionWidth={70}
                    rightSection={
                      <Group gap={4}>
                        <CopyButton
                          value={settings.newznabApiKey || ""}
                          timeout={2000}
                        >
                          {({ copied, copy }) => (
                            <Tooltip
                              label={
                                copied
                                  ? t("indexer_apis.newznab.copied")
                                  : t("indexer_apis.newznab.copy")
                              }
                              withArrow
                              position="left"
                            >
                              <ActionIcon
                                color={copied ? "teal" : "gray"}
                                onClick={copy}
                                variant="subtle"
                                size="sm"
                              >
                                {copied ? (
                                  <IconCheck size="1rem" />
                                ) : (
                                  <IconCopy size="1rem" />
                                )}
                              </ActionIcon>
                            </Tooltip>
                          )}
                        </CopyButton>
                        <Tooltip
                          label={t("indexer_apis.newznab.regenerate")}
                          withArrow
                        >
                          <ActionIcon
                            onClick={() => handleRegenerateKey("newznab")}
                            variant="subtle"
                            size="sm"
                            loading={regenerateKey.isPending}
                          >
                            <IconRefresh size="1rem" />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    }
                  />
                </Stack>

                <Divider />

                {/* SABnzbd Configuration */}
                <Stack gap="sm">
                  <Title order={5}>{t("indexer_apis.sabnzbd.title")}</Title>
                  <TextInput
                    label={t("indexer_apis.sabnzbd.api_key")}
                    value={settings.sabnzbdApiKey || ""}
                    readOnly
                    rightSectionWidth={70}
                    rightSection={
                      <Group gap={4}>
                        <CopyButton
                          value={settings.sabnzbdApiKey || ""}
                          timeout={2000}
                        >
                          {({ copied, copy }) => (
                            <Tooltip
                              label={
                                copied
                                  ? t("indexer_apis.sabnzbd.copied")
                                  : t("indexer_apis.sabnzbd.copy")
                              }
                              withArrow
                              position="left"
                            >
                              <ActionIcon
                                color={copied ? "teal" : "gray"}
                                onClick={copy}
                                variant="subtle"
                                size="sm"
                              >
                                {copied ? (
                                  <IconCheck size="1rem" />
                                ) : (
                                  <IconCopy size="1rem" />
                                )}
                              </ActionIcon>
                            </Tooltip>
                          )}
                        </CopyButton>
                        <Tooltip
                          label={t("indexer_apis.sabnzbd.regenerate")}
                          withArrow
                        >
                          <ActionIcon
                            onClick={() => handleRegenerateKey("sabnzbd")}
                            variant="subtle"
                            size="sm"
                            loading={regenerateKey.isPending}
                          >
                            <IconRefresh size="1rem" />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    }
                  />
                </Stack>

                <Divider />

                {/* Configuration Instructions */}
                <Alert
                  icon={<IconInfoCircle size="1rem" />}
                  variant="light"
                  color="blue"
                >
                  <Stack gap="xs">
                    <Text size="xs">
                      <strong>
                        {t("indexer_apis.configuration.usenet_title")}:
                      </strong>
                    </Text>
                    <Text size="xs">
                      <strong>
                        {t("indexer_apis.configuration.add_client")}
                      </strong>
                      <br />
                      <Trans
                        i18nKey="settings.indexer.indexer_apis.configuration.client_name"
                        components={{ c: <Code /> }}
                      />
                      <br />
                      <Trans
                        i18nKey="settings.indexer.indexer_apis.configuration.client_host"
                        components={{ c: <Code /> }}
                      />
                      <br />
                      <Trans
                        i18nKey="settings.indexer.indexer_apis.configuration.client_port"
                        components={{ c: <Code /> }}
                      />
                      <br />
                      <Trans
                        i18nKey="settings.indexer.indexer_apis.configuration.client_url_base"
                        components={{ c: <Code /> }}
                      />
                      <br />
                      <Trans
                        i18nKey="settings.indexer.indexer_apis.configuration.client_api_key"
                        values={{ key: settings.sabnzbdApiKey }}
                        components={{ c: <Code /> }}
                      />
                      <br />
                      <Trans
                        i18nKey="settings.indexer.indexer_apis.configuration.client_category"
                        components={{ c: <Code /> }}
                      />
                      <br />
                      <Trans
                        i18nKey="settings.indexer.indexer_apis.configuration.client_priority"
                        components={{ c: <Code /> }}
                      />
                    </Text>
                    <Text size="xs">
                      <strong>
                        {t("indexer_apis.configuration.add_indexer")}
                      </strong>
                      <br />
                      <Trans
                        i18nKey="settings.indexer.indexer_apis.configuration.indexer_url"
                        components={{ c: <Code /> }}
                      />
                      <br />
                      <Trans
                        i18nKey="settings.indexer.indexer_apis.configuration.api_path"
                        components={{ c: <Code /> }}
                      />
                      <br />
                      <Trans
                        i18nKey="settings.indexer.indexer_apis.configuration.api_key"
                        values={{ key: settings.newznabApiKey }}
                        components={{ c: <Code /> }}
                      />
                      <br />
                      <Trans
                        i18nKey="settings.indexer.indexer_apis.configuration.categories"
                        components={{ c: <Code /> }}
                      />
                      <br />
                      <Trans
                        i18nKey="settings.indexer.indexer_apis.configuration.download_client"
                        components={{ c: <Code /> }}
                      />
                    </Text>
                  </Stack>
                </Alert>

                <Divider />

                {/* Indexer-only mode */}
                <Group justify="space-between" align="center">
                  <div>
                    <Text size="sm" fw={500}>
                      {t("indexer_only_mode.title")}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {t("indexer_only_mode.description")}
                    </Text>
                  </div>
                  <Switch
                    checked={indexerOnlyMode}
                    onChange={(e) =>
                      handleIndexerOnlyModeToggle(e.currentTarget.checked)
                    }
                    size="md"
                    disabled={updateSettings.isPending}
                  />
                </Group>

                <Divider />

                {/* Directory Configuration */}
                <Stack gap="sm">
                  <Title order={5}>{t("directories.title")}</Title>
                  <FolderInput
                    label={t("directories.completed.label")}
                    value={indexerCompletedDir}
                    onChange={(value, fromBrowser) => {
                      setIndexerCompletedDir(value);
                      // Save immediately only when value changes from folder browser
                      if (fromBrowser) {
                        handleDirectorySave("completed", value);
                      }
                    }}
                    onBlur={() =>
                      handleDirectorySave("completed", indexerCompletedDir)
                    }
                    placeholder={t("directories.completed.placeholder")}
                    description={t("directories.completed.description")}
                  />
                  <FolderInput
                    label={t("directories.incomplete.label")}
                    value={indexerIncompleteDir}
                    onChange={(value, fromBrowser) => {
                      setIndexerIncompleteDir(value);
                      // Save immediately only when value changes from folder browser
                      if (fromBrowser) {
                        handleDirectorySave("incomplete", value);
                      }
                    }}
                    onBlur={() =>
                      handleDirectorySave("incomplete", indexerIncompleteDir)
                    }
                    placeholder={t("directories.incomplete.placeholder")}
                    description={t("directories.incomplete.description")}
                  />
                  <Group justify="space-between" align="center">
                    <div>
                      <Text size="sm" fw={500}>
                        {t("directories.category_subdirs.label")}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {t("directories.category_subdirs.description")}
                      </Text>
                    </div>
                    <Switch
                      checked={indexerCategoryDir}
                      onChange={(e) =>
                        handleCategoryDirToggle(e.currentTarget.checked)
                      }
                      size="md"
                      disabled={updateSettings.isPending}
                    />
                  </Group>
                </Stack>
              </Stack>
            </>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}
