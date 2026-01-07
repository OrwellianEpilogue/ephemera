import { useTranslation, Trans } from "react-i18next"; // Ajout de Trans
import {
  Paper,
  Stack,
  Title,
  Text,
  TextInput,
  PasswordInput,
  Select,
  Switch,
  Button,
  Group,
  Alert,
  Badge,
  Loader,
  Divider,
} from "@mantine/core";
import {
  IconInfoCircle,
  IconCloud,
  IconCloudUpload,
  IconCheck,
  IconX,
  IconAlertTriangle,
  IconTrash,
  IconFolders,
} from "@tabler/icons-react";
import { useState, useEffect } from "react";
import {
  useTolinoSettings,
  useTolinoResellers,
  useTolinoCollections,
  useSaveTolinoSettings,
  useDeleteTolinoSettings,
  useTestTolinoConnection,
  useUpdateTolinoAutoUpload,
  useUpdateTolinoCollectionSettings,
} from "../hooks/useTolino";
import { useCalibreStatus } from "../hooks/useCalibre";
import type { TolinoReseller } from "@ephemera/shared";

interface TolinoSettingsProps {
  keepInDownloads: boolean;
}

export function TolinoSettings({ keepInDownloads }: TolinoSettingsProps) {
  const { t } = useTranslation("translation", {
    keyPrefix: "settings.tolino",
  });
  const { data: settings, isLoading: loadingSettings } = useTolinoSettings();
  const { data: resellers } = useTolinoResellers();
  const { data: collectionsData, isLoading: loadingCollections } =
    useTolinoCollections(!!settings?.configured && !!settings?.isConnected);
  const { data: calibreStatus } = useCalibreStatus();
  const saveSettings = useSaveTolinoSettings();
  const deleteSettings = useDeleteTolinoSettings();
  const testConnection = useTestTolinoConnection();
  const updateAutoUpload = useUpdateTolinoAutoUpload();
  const updateCollectionSettings = useUpdateTolinoCollectionSettings();

  // Form state
  const [resellerId, setResellerId] = useState<TolinoReseller>("buchhandlung");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [autoUpload, setAutoUpload] = useState(false);
  const [askCollectionOnUpload, setAskCollectionOnUpload] = useState(false);
  const [autoUploadCollection, setAutoUploadCollection] = useState<
    string | null
  >(null);
  const [useSeriesAsCollection, setUseSeriesAsCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");

  // Initialize form with existing settings
  useEffect(() => {
    if (settings?.configured) {
      setResellerId((settings.resellerId as TolinoReseller) || "buchhandlung");
      setEmail(settings.email || "");
      setAutoUpload(settings.autoUpload || false);
      setAskCollectionOnUpload(settings.askCollectionOnUpload || false);
      setAutoUploadCollection(settings.autoUploadCollection || null);
      setUseSeriesAsCollection(settings.useSeriesAsCollection || false);
    }
  }, [settings]);

  const handleSave = async () => {
    if (!email || !password) return;

    await saveSettings.mutateAsync({
      resellerId,
      email,
      password,
      autoUpload,
      askCollectionOnUpload,
      autoUploadCollection,
      useSeriesAsCollection,
    });

    setPassword(""); // Clear password after save
  };

  const handleDelete = async () => {
    await deleteSettings.mutateAsync();
    setEmail("");
    setPassword("");
    setAutoUpload(false);
  };

  const handleTest = async () => {
    await testConnection.mutateAsync();
  };

  const handleAutoUploadToggle = async (checked: boolean) => {
    setAutoUpload(checked);
    if (settings?.configured) {
      await updateAutoUpload.mutateAsync(checked);
    }
  };

  const handleAskCollectionToggle = async (checked: boolean) => {
    setAskCollectionOnUpload(checked);
    if (settings?.configured) {
      await updateCollectionSettings.mutateAsync({
        askCollectionOnUpload: checked,
        autoUploadCollection,
        useSeriesAsCollection,
      });
    }
  };

  const handleAutoUploadCollectionChange = async (value: string | null) => {
    if (value === "__new__") return;

    setAutoUploadCollection(value);
    if (settings?.configured) {
      await updateCollectionSettings.mutateAsync({
        askCollectionOnUpload,
        autoUploadCollection: value,
        useSeriesAsCollection,
      });
    }
  };

  const handleSeriesCollectionToggle = async (checked: boolean) => {
    setUseSeriesAsCollection(checked);
    if (settings?.configured) {
      await updateCollectionSettings.mutateAsync({
        askCollectionOnUpload,
        autoUploadCollection,
        useSeriesAsCollection: checked,
      });
    }
  };

  const handleCreateNewCollection = async () => {
    if (!newCollectionName.trim()) return;
    const collectionName = newCollectionName.trim();
    setAutoUploadCollection(collectionName);
    setNewCollectionName("");
    if (settings?.configured) {
      await updateCollectionSettings.mutateAsync({
        askCollectionOnUpload,
        autoUploadCollection: collectionName,
        useSeriesAsCollection,
      });
    }
  };

  if (loadingSettings) {
    return (
      <Paper p="md" withBorder>
        <Stack align="center" gap="md" py="xl">
          <Loader size="lg" />
          <Text c="dimmed">{t("loading")}</Text>
        </Stack>
      </Paper>
    );
  }

  const resellerOptions =
    resellers?.map((r) => ({
      value: r.id,
      label: r.name,
    })) || [];

  const isConnected = settings?.configured && settings?.isConnected;

  // Format token expiry time
  const formatExpiry = (expiresAt: number | null | undefined) => {
    if (!expiresAt) return null;
    const now = Date.now();
    const diffMs = expiresAt - now;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMs < 0) return t("status.expired");
    if (diffMins < 60) return `${diffMins} min`;
    if (diffHours < 24) return `${diffHours}h ${diffMins % 60}m`;
    return `${diffDays}d ${diffHours % 24}h`;
  };

  const tokenExpiry = settings?.tokenExpiresAt
    ? formatExpiry(settings.tokenExpiresAt)
    : null;

  return (
    <Paper p="md" withBorder>
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <div>
            <Group gap="sm">
              <Title order={3}>{t("title")}</Title>
              {isConnected && (
                <Badge color="green" leftSection={<IconCheck size={12} />}>
                  {t("status.connected")}
                </Badge>
              )}
              {settings?.configured && !settings?.isConnected && (
                <Badge color="red" leftSection={<IconX size={12} />}>
                  {t("status.expired")}
                </Badge>
              )}
            </Group>
            <Text size="sm" c="dimmed">
              {t("description")}
            </Text>
          </div>
          <IconCloud size={32} style={{ opacity: 0.5 }} />
        </Group>

        {!keepInDownloads && (
          <Alert
            icon={<IconAlertTriangle size={16} />}
            color="orange"
            title={t("alerts.file_access_disabled.title")}
          >
            <Text size="sm">
              <Trans
                t={t}
                i18nKey="alerts.file_access_disabled.message"
                components={{ 1: <strong /> }}
              />
            </Text>
          </Alert>
        )}

        <Alert icon={<IconInfoCircle size={16} />} color="blue">
          <Text size="sm">
            {t("alerts.formats.message")}
            {calibreStatus?.available
              ? ` ${t("alerts.formats.calibre_available")}`
              : ` ${t("alerts.formats.calibre_missing")}`}
          </Text>
        </Alert>

        <Alert icon={<IconInfoCircle size={16} />} color="gray" variant="light">
          <Text size="sm">
            <Trans
              t={t}
              i18nKey="alerts.tip.label"
              components={{ 1: <strong /> }}
            />{" "}
            {t("alerts.tip.message")}
          </Text>
        </Alert>

        <Divider />

        <Select
          label={t("form.reseller.label")}
          description={t("form.reseller.description")}
          data={resellerOptions}
          value={resellerId}
          onChange={(value) => {
            setResellerId((value as TolinoReseller) || "buchhandlung");
          }}
          required
        />

        <TextInput
          label={t("form.email.label")}
          description={t("form.email.description")}
          placeholder="email@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <PasswordInput
          label={t("form.password.label")}
          description={
            settings?.configured
              ? t("form.password.description.update")
              : t("form.password.description.new")
          }
          placeholder={
            settings?.configured ? "••••••••" : t("form.password.placeholder")
          }
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required={!settings?.configured}
        />

        <Switch
          label={t("form.auto_upload.label")}
          description={t("form.auto_upload.description")}
          checked={autoUpload}
          onChange={(e) => handleAutoUploadToggle(e.currentTarget.checked)}
          disabled={!keepInDownloads}
        />

        {settings?.configured && isConnected && autoUpload && (
          <Stack
            gap="xs"
            ml="md"
            style={{
              borderLeft: "2px solid var(--mantine-color-default-border)",
              paddingLeft: "var(--mantine-spacing-md)",
            }}
          >
            <Select
              label={t("form.auto_upload_collection.label")}
              description={t("form.auto_upload_collection.description")}
              placeholder={
                loadingCollections
                  ? t("status.loading_collections")
                  : t("form.auto_upload_collection.placeholder")
              }
              data={[
                {
                  value: "",
                  label: t("form.auto_upload_collection.placeholder"),
                },
                ...(collectionsData?.collections?.map((c) => ({
                  value: c,
                  label: c,
                })) || []),
                {
                  value: "__new__",
                  label: t("form.auto_upload_collection.new"),
                },
              ]}
              value={
                autoUploadCollection === "__new__"
                  ? "__new__"
                  : autoUploadCollection || ""
              }
              onChange={(value) =>
                handleAutoUploadCollectionChange(value || null)
              }
              disabled={
                loadingCollections || updateCollectionSettings.isPending
              }
              clearable
              searchable
            />

            {autoUploadCollection === "__new__" && (
              <Group gap="xs">
                <TextInput
                  placeholder={t(
                    "tolino.form.auto_upload_collection.new_placeholder",
                  )}
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  style={{ flex: 1 }}
                />
                <Button
                  size="sm"
                  onClick={handleCreateNewCollection}
                  disabled={!newCollectionName.trim()}
                >
                  {t("form.auto_upload_collection.create")}
                </Button>
              </Group>
            )}
          </Stack>
        )}

        {settings?.configured && isConnected && (
          <>
            <Divider />

            <Group gap="xs" align="center">
              <IconFolders size={20} style={{ opacity: 0.7 }} />
              <Text fw={500}>{t("form.collection_options.title")}</Text>
            </Group>

            <Switch
              label={t("form.ask_collection.label")}
              description={t("form.ask_collection.description")}
              checked={askCollectionOnUpload}
              onChange={(e) =>
                handleAskCollectionToggle(e.currentTarget.checked)
              }
              disabled={updateCollectionSettings.isPending}
            />

            <Switch
              label={t("form.use_series.label")}
              description={t("form.use_series.description")}
              checked={useSeriesAsCollection}
              onChange={(e) =>
                handleSeriesCollectionToggle(e.currentTarget.checked)
              }
              disabled={updateCollectionSettings.isPending}
            />
          </>
        )}

        <Group justify="space-between" mt="md">
          <Group gap="sm">
            <Button
              onClick={handleSave}
              loading={saveSettings.isPending}
              disabled={!email || (!password && !settings?.configured)}
              leftSection={<IconCloudUpload size={16} />}
            >
              {settings?.configured
                ? t("buttons.update")
                : t("buttons.connect")}
            </Button>
            {settings?.configured && (
              <>
                <Button
                  variant="light"
                  onClick={handleTest}
                  loading={testConnection.isPending}
                >
                  {t("buttons.test")}
                </Button>
                {tokenExpiry && (
                  <Text size="xs" c="dimmed">
                    {t("buttons.token_expiry", { expiry: tokenExpiry })}
                  </Text>
                )}
              </>
            )}
          </Group>

          {settings?.configured && (
            <Button
              variant="subtle"
              color="red"
              onClick={handleDelete}
              loading={deleteSettings.isPending}
              leftSection={<IconTrash size={16} />}
            >
              {t("buttons.disconnect")}
            </Button>
          )}
        </Group>
      </Stack>
    </Paper>
  );
}

export default TolinoSettings;
