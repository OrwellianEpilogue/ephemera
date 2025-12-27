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
} from "@tabler/icons-react";
import { useState, useEffect } from "react";
import {
  useTolinoSettings,
  useTolinoResellers,
  useSaveTolinoSettings,
  useDeleteTolinoSettings,
  useTestTolinoConnection,
  useUpdateTolinoAutoUpload,
} from "../hooks/useTolino";
import { useCalibreStatus } from "../hooks/useCalibre";
import type { TolinoReseller } from "@ephemera/shared";

interface TolinoSettingsProps {
  keepInDownloads: boolean;
}

export function TolinoSettings({ keepInDownloads }: TolinoSettingsProps) {
  const { data: settings, isLoading: loadingSettings } = useTolinoSettings();
  const { data: resellers } = useTolinoResellers();
  const { data: calibreStatus } = useCalibreStatus();
  const saveSettings = useSaveTolinoSettings();
  const deleteSettings = useDeleteTolinoSettings();
  const testConnection = useTestTolinoConnection();
  const updateAutoUpload = useUpdateTolinoAutoUpload();

  // Form state
  const [resellerId, setResellerId] = useState<TolinoReseller>("buchhandlung");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [autoUpload, setAutoUpload] = useState(false);

  // Initialize form with existing settings
  useEffect(() => {
    if (settings?.configured) {
      setResellerId((settings.resellerId as TolinoReseller) || "buchhandlung");
      setEmail(settings.email || "");
      setAutoUpload(settings.autoUpload || false);
    }
  }, [settings]);

  const handleSave = async () => {
    if (!email || !password) return;

    await saveSettings.mutateAsync({
      resellerId,
      email,
      password,
      autoUpload,
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
