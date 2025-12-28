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
  const [newCollectionName, setNewCollectionName] = useState("");

  // Initialize form with existing settings
  useEffect(() => {
    if (settings?.configured) {
      setResellerId((settings.resellerId as TolinoReseller) || "buchhandlung");
      setEmail(settings.email || "");
      setAutoUpload(settings.autoUpload || false);
      setAskCollectionOnUpload(settings.askCollectionOnUpload || false);
      setAutoUploadCollection(settings.autoUploadCollection || null);
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
      });
    }
  };

  const handleAutoUploadCollectionChange = async (value: string | null) => {
    // Handle "new" option - don't save yet
    if (value === "__new__") {
      return;
    }

    setAutoUploadCollection(value);
    if (settings?.configured) {
      await updateCollectionSettings.mutateAsync({
        askCollectionOnUpload,
        autoUploadCollection: value,
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
      });
    }
  };

  if (loadingSettings) {
    return (
      <Paper p="md" withBorder>
        <Stack align="center" gap="md" py="xl">
          <Loader size="lg" />
          <Text c="dimmed">Loading Tolino settings...</Text>
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

    if (diffMs < 0) return "Expired";
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
              <Title order={3}>Tolino Cloud</Title>
              {isConnected && (
                <Badge color="green" leftSection={<IconCheck size={12} />}>
                  Connected
                </Badge>
              )}
              {settings?.configured && !settings?.isConnected && (
                <Badge color="red" leftSection={<IconX size={12} />}>
                  Session Expired
                </Badge>
              )}
            </Group>
            <Text size="sm" c="dimmed">
              Upload books directly to your Tolino e-reader via the Tolino Cloud
            </Text>
          </div>
          <IconCloud size={32} style={{ opacity: 0.5 }} />
        </Group>

        {!keepInDownloads && (
          <Alert
            icon={<IconAlertTriangle size={16} />}
            color="orange"
            title="File access disabled"
          >
            <Text size="sm">
              Enable <strong>"Keep copy in downloads folder"</strong> in the
              General tab under Post-Download Actions to use Tolino Cloud
              upload. Without this setting, downloaded files may not be
              available for upload.
            </Text>
          </Alert>
        )}

        <Alert icon={<IconInfoCircle size={16} />} color="blue">
          <Text size="sm">
            Tolino Cloud only accepts EPUB and PDF files.
            {calibreStatus?.available
              ? " Other formats will be automatically converted using Calibre."
              : " Install Calibre to enable automatic format conversion for other formats."}
          </Text>
        </Alert>

        <Alert icon={<IconInfoCircle size={16} />} color="gray" variant="light">
          <Text size="sm">
            <strong>Tip:</strong> We recommend creating a free{" "}
            <a
              href="https://www.buchhandlung.de"
              target="_blank"
              rel="noopener noreferrer"
            >
              Buchhandlung.de
            </a>{" "}
            account and linking it to your existing Tolino account. This
            provides the most reliable connection for automated uploads.
          </Text>
        </Alert>

        <Divider />

        <Select
          label="Reseller"
          description="Select your Tolino book store"
          data={resellerOptions}
          value={resellerId}
          onChange={(value) => {
            setResellerId((value as TolinoReseller) || "buchhandlung");
          }}
          required
        />

        <TextInput
          label="Email"
          description="Your Tolino account email"
          placeholder="email@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <PasswordInput
          label="Password"
          description={
            settings?.configured
              ? "Leave empty to keep current password, or enter new password to update"
              : "Your Tolino account password"
          }
          placeholder={
            settings?.configured ? "••••••••" : "Enter your password"
          }
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required={!settings?.configured}
        />

        <Switch
          label="Auto-upload to Tolino Cloud"
          description="Automatically upload books to Tolino Cloud when download completes"
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
              label="Default collection for auto-uploads"
              description="Automatically add auto-uploaded books to this collection"
              placeholder={
                loadingCollections ? "Loading..." : "None (no collection)"
              }
              data={[
                { value: "", label: "None (no collection)" },
                ...(collectionsData?.collections?.map((c) => ({
                  value: c,
                  label: c,
                })) || []),
                { value: "__new__", label: "+ Create new collection..." },
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
                  placeholder="New collection name"
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  style={{ flex: 1 }}
                />
                <Button
                  size="sm"
                  onClick={handleCreateNewCollection}
                  disabled={!newCollectionName.trim()}
                >
                  Create
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
              <Text fw={500}>Collection Options</Text>
            </Group>

            <Switch
              label="Ask for collection on manual upload"
              description="Show a dialog to select or create a collection when manually uploading books"
              checked={askCollectionOnUpload}
              onChange={(e) =>
                handleAskCollectionToggle(e.currentTarget.checked)
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
              {settings?.configured ? "Update Settings" : "Connect"}
            </Button>
            {settings?.configured && (
              <>
                <Button
                  variant="light"
                  onClick={handleTest}
                  loading={testConnection.isPending}
                >
                  Test Connection
                </Button>
                {tokenExpiry && (
                  <Text size="xs" c="dimmed">
                    Token expires in {tokenExpiry} (auto-renews)
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
              Disconnect
            </Button>
          )}
        </Group>
      </Stack>
    </Paper>
  );
}

export default TolinoSettings;
