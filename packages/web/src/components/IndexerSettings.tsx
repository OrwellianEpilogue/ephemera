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

export function IndexerSettings() {
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
        title: "Settings updated",
        message: `Indexer APIs ${enabled ? "enabled" : "disabled"}`,
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
        title: "API key regenerated",
        message: `New ${service} API key generated successfully`,
        color: "green",
      });
    } catch (_error) {
      notifications.show({
        title: "Error",
        message: `Failed to regenerate ${service} API key`,
        color: "red",
      });
    }
  };

  const handleBaseUrlSave = async () => {
    try {
      await updateSettings.mutateAsync({ baseUrl });
      notifications.show({
        title: "Settings updated",
        message: "Base URL has been updated",
        color: "green",
      });
    } catch (_error) {
      notifications.show({
        title: "Error",
        message: "Failed to update base URL",
        color: "red",
      });
    }
  };

  const handleIndexerOnlyModeToggle = async (enabled: boolean) => {
    setIndexerOnlyMode(enabled);
    try {
      await updateSettings.mutateAsync({ indexerOnlyMode: enabled });
      notifications.show({
        title: "Settings updated",
        message: enabled
          ? "Indexer-only mode enabled - only indexer downloads will be visible in SABnzbd APIs"
          : "Indexer-only mode disabled - all downloads will be visible in SABnzbd APIs",
        color: "green",
      });
    } catch (_error) {
      notifications.show({
        title: "Error",
        message: "Failed to update indexer-only mode",
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
        title: "Settings updated",
        message: `${field === "completed" ? "Completed" : "Incomplete"} directory path updated`,
        color: "green",
      });
    } catch {
      notifications.show({
        title: "Error",
        message: `Failed to update ${field} directory path`,
        color: "red",
      });
    }
  };

  const handleCategoryDirToggle = async (enabled: boolean) => {
    setIndexerCategoryDir(enabled);
    try {
      await updateSettings.mutateAsync({ indexerCategoryDir: enabled });
      notifications.show({
        title: "Settings updated",
        message: enabled
          ? "Category subdirectories enabled"
          : "Category subdirectories disabled",
        color: "green",
      });
    } catch (_error) {
      notifications.show({
        title: "Error",
        message: "Failed to update category directory setting",
        color: "red",
      });
      setIndexerCategoryDir(!enabled); // Revert on error
    }
  };

  if (error) {
    return (
      <Alert icon={<IconInfoCircle size="1rem" />} color="red">
        <Text>Failed to load indexer settings: {String(error)}</Text>
      </Alert>
    );
  }

  if (isLoading || !settings) {
    return <Text>Loading indexer settings...</Text>;
  }

  return (
    <Stack gap="lg">
      <Alert icon={<IconInfoCircle size="1rem" />} variant="light">
        <Text size="sm">
          Enable these services to make Ephemera compatible with *arr
          applications like Readarr and LazyLibrarian. Ephemera will act as both
          a Newznab indexer and SABnzbd download client.
        </Text>
      </Alert>

      {/* Base URL Configuration */}
      <Paper p="md" withBorder>
        <Stack gap="md">
          <Title order={4}>API Configuration</Title>
          <TextInput
            label="Base URL"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.currentTarget.value)}
            onBlur={handleBaseUrlSave}
            placeholder="http://192.168.1.100:8286"
            description="The internal URL where Ephemera is accessible for other tools"
            required
          />
          <Text size="xs" c="dimmed">
            Set this to the IP address or domain where Ephemera is running. For
            Docker setups, use your host IP, not localhost.
          </Text>
        </Stack>
      </Paper>

      {/* Indexer APIs Settings */}
      <Paper p="md" withBorder>
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <div>
              <Title order={4}>Indexer APIs</Title>
              <Text size="sm" c="dimmed">
                Enable Newznab and SABnzbd APIs for *arr applications
              </Text>
            </div>
            <Switch
              checked={indexersEnabled}
              onChange={(e) => handleIndexersToggle(e.currentTarget.checked)}
              size="lg"
              disabled={updateSettings.isPending}
            />
          </Group>

          {indexersEnabled && (
            <>
              <Divider />
              <Stack gap="md">
                {/* Newznab Configuration */}
                <Stack gap="sm">
                  <Title order={5}>Newznab (Indexer)</Title>
                  <TextInput
                    label="API Key"
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
                              label={copied ? "Copied" : "Copy API key"}
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
                        <Tooltip label="Regenerate API key" withArrow>
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
                  <Title order={5}>SABnzbd (Download Client)</Title>
                  <TextInput
                    label="API Key"
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
                              label={copied ? "Copied" : "Copy API key"}
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
                        <Tooltip label="Regenerate API key" withArrow>
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
                      <strong>Usenet Configuration:</strong>
                    </Text>
                    <Text size="xs">
                      <strong>2. Add Download Client:</strong> Settings →
                      Download Clients → Add → SABnzbd
                      <br />
                      Name: <Code>Ephemera</Code>
                      <br />
                      Host: <Code>192.168.1.1</Code>
                      (Your internal IP of Ephemera)
                      <br />
                      Port: <Code>8286</Code>
                      <br />
                      URL Base: <Code>sabnzbd</Code> (Requires toggling Advanced
                      Settings)
                      <br />
                      API Key: <Code>{settings.sabnzbdApiKey}</Code>
                      <br />
                      Category: <Code>ephemera</Code>
                      <br />
                      Client Priority: <Code>50</Code> (Requires toggling
                      Advanced Settings)
                    </Text>
                    <Text size="xs">
                      <strong>1. Add Indexer:</strong> Settings → Indexers → Add
                      → Newznab → Custom
                      <br />
                      URL: <Code>https://192.168.1.1:8286</Code>
                      (Your internal IP of Ephemera)
                      <br />
                      API Path: <Code>/newznab/api</Code> (Requires toggling
                      Advanced Settings)
                      <br />
                      API Key: <Code>{settings.newznabApiKey}</Code>
                      <br />
                      Categories:
                      <Code>7000,7010,7020,7030</Code>
                      <br />
                      Download Client:
                      <Code>Ephemera</Code>
                    </Text>
                  </Stack>
                </Alert>

                <Divider />

                {/* Indexer-only mode */}
                <Group justify="space-between" align="center">
                  <div>
                    <Text size="sm" fw={500}>
                      Indexer-only Mode
                    </Text>
                    <Text size="xs" c="dimmed">
                      Only expose downloads initiated via indexer APIs in the
                      queue and history. Web downloads won't be visible. Files
                      won't be moved to other folders.
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
                  <Title order={5}>Download Directories</Title>
                  <FolderInput
                    label="Completed Downloads Directory"
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
                    placeholder="/downloads/complete"
                    description="Path where completed downloads from indexer will be moved"
                  />
                  <FolderInput
                    label="Incomplete Downloads Directory"
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
                    placeholder="/downloads/incomplete"
                    description="Path for temporary files during download"
                  />
                  <Group justify="space-between" align="center">
                    <div>
                      <Text size="sm" fw={500}>
                        Use Category Subdirectories
                      </Text>
                      <Text size="xs" c="dimmed">
                        Create subdirectories based on category (e.g.,
                        /downloads/complete/ephemera/)
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
